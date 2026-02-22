#!/bin/bash
# ============================================================
# Pax Full Backup — runs daily at 2AM via OpenClaw cron
#
# Backs up to S3: s3://pax-memory-sbdz/backups/YYYY-MM-DD/
#   - workspace.tar.gz        (plaintext — code, memory, docs)
#   - secrets.tar.gz.enc      (AES-256 encrypted — API keys, config)
#   - cron-jobs.json          (cron job definitions)
#   - manifest.json           (versions, checksums, restore metadata)
#
# Requires env var: PAX_BACKUP_PASSPHRASE
# Store passphrase in macOS Keychain or password manager.
# ============================================================
set -euo pipefail

OPENCLAW_DIR="/Users/pax/.openclaw"
WORKSPACE="$OPENCLAW_DIR/workspace"
S3_BUCKET="pax-memory-sbdz"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
S3_PREFIX="backups/$DATE"
TMPDIR=$(mktemp -d)
LOG="$WORKSPACE/memory/backup.log"

trap 'rm -rf "$TMPDIR"; echo "[backup] Cleaned up tmp dir"' EXIT

# ── Passphrase ───────────────────────────────────────────────
# Load from env var, macOS Keychain, or fail
if [[ -z "${PAX_BACKUP_PASSPHRASE:-}" ]]; then
  PAX_BACKUP_PASSPHRASE=$(security find-generic-password \
    -s "pax-backup" -a "pax" -w 2>/dev/null || true)
fi
if [[ -z "${PAX_BACKUP_PASSPHRASE:-}" ]]; then
  echo "[backup] ERROR: PAX_BACKUP_PASSPHRASE not set and not in Keychain." >&2
  echo "[backup] Run: security add-generic-password -s pax-backup -a pax -w 'YOUR_PASSPHRASE'" >&2
  exit 1
fi

echo "[backup] Starting Pax backup — $TIMESTAMP" | tee -a "$LOG"

# ── 1. Workspace (plaintext) ─────────────────────────────────
echo "[backup] Archiving workspace..." | tee -a "$LOG"
tar -czf "$TMPDIR/workspace.tar.gz" \
  --exclude="$WORKSPACE/.env.local" \
  --exclude="$WORKSPACE/memory/hot.db*" \
  --exclude="$WORKSPACE/.git" \
  --exclude="$WORKSPACE/securebydezign.com/node_modules" \
  --exclude="$WORKSPACE/securebydezign.com/lambda/node_modules" \
  --exclude="$WORKSPACE/securebydezign.com/lambda-deploy.zip" \
  -C "$(dirname "$WORKSPACE")" \
  "$(basename "$WORKSPACE")"

# ── 2. Secrets (encrypted) ───────────────────────────────────
echo "[backup] Encrypting secrets..." | tee -a "$LOG"
tar -czf "$TMPDIR/secrets.tar.gz" \
  -C "$OPENCLAW_DIR" \
  "openclaw.json" \
  -C "$WORKSPACE" \
  ".env.local" 2>/dev/null || \
tar -czf "$TMPDIR/secrets.tar.gz" \
  -C "$OPENCLAW_DIR" "openclaw.json"  # fallback if .env.local missing

openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
  -in  "$TMPDIR/secrets.tar.gz" \
  -out "$TMPDIR/secrets.tar.gz.enc" \
  -pass "pass:$PAX_BACKUP_PASSPHRASE"

rm "$TMPDIR/secrets.tar.gz"  # remove unencrypted copy

# ── 3. Cron jobs (plaintext JSON) ───────────────────────────
echo "[backup] Backing up cron jobs..." | tee -a "$LOG"
cp "$OPENCLAW_DIR/cron/jobs.json" "$TMPDIR/cron-jobs.json"

# ── 4. Manifest ──────────────────────────────────────────────
WORKSPACE_SHA=$(shasum -a 256 "$TMPDIR/workspace.tar.gz" | awk '{print $1}')
SECRETS_SHA=$(shasum -a 256 "$TMPDIR/secrets.tar.gz.enc" | awk '{print $1}')
OPENCLAW_VERSION=$(cat /opt/homebrew/lib/node_modules/openclaw/package.json \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "unknown")

cat > "$TMPDIR/manifest.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "date": "$DATE",
  "openclaw_version": "$OPENCLAW_VERSION",
  "node_version": "$(node --version)",
  "os": "$(sw_vers -productVersion 2>/dev/null || echo unknown)",
  "files": {
    "workspace.tar.gz":    { "sha256": "$WORKSPACE_SHA", "encrypted": false },
    "secrets.tar.gz.enc":  { "sha256": "$SECRETS_SHA",   "encrypted": true  },
    "cron-jobs.json":      { "encrypted": false }
  },
  "restore_steps": [
    "1. Install Homebrew: /bin/bash -c $(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)",
    "2. Install OpenClaw: npm install -g openclaw@OPENCLAW_VERSION",
    "3. Download backup: aws s3 cp s3://pax-memory-sbdz/backups/DATE/ . --recursive",
    "4. Decrypt secrets: openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d -in secrets.tar.gz.enc -out secrets.tar.gz -pass pass:PASSPHRASE",
    "5. Extract workspace: tar -xzf workspace.tar.gz -C /Users/pax/.openclaw/",
    "6. Extract secrets: tar -xzf secrets.tar.gz -C /Users/pax/.openclaw/",
    "7. Restore cron jobs: cp cron-jobs.json /Users/pax/.openclaw/cron/jobs.json",
    "8. Rebuild search index: cd /Users/pax/.openclaw/workspace && python3 memory/bin/ingest.py",
    "9. Start OpenClaw: openclaw gateway start"
  ]
}
EOF

# ── 5. Upload to S3 ──────────────────────────────────────────
echo "[backup] Uploading to s3://$S3_BUCKET/$S3_PREFIX/" | tee -a "$LOG"
for file in workspace.tar.gz secrets.tar.gz.enc cron-jobs.json manifest.json; do
  aws s3 cp "$TMPDIR/$file" "s3://$S3_BUCKET/$S3_PREFIX/$file" --quiet
  echo "[backup]   ✓ $file" | tee -a "$LOG"
done

# ── 6. Prune old backups (keep last 30 days) ─────────────────
echo "[backup] Pruning backups older than 30 days..." | tee -a "$LOG"
CUTOFF=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "30 days ago" +%Y-%m-%d)
aws s3 ls "s3://$S3_BUCKET/backups/" | awk '{print $2}' | tr -d '/' | while read -r backup_date; do
  if [[ "$backup_date" < "$CUTOFF" ]]; then
    echo "[backup]   Removing old backup: $backup_date" | tee -a "$LOG"
    aws s3 rm "s3://$S3_BUCKET/backups/$backup_date/" --recursive --quiet
  fi
done

echo "[backup] ✅ Done — s3://$S3_BUCKET/$S3_PREFIX/" | tee -a "$LOG"
echo "" >> "$LOG"
