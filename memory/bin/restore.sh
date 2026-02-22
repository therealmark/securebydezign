#!/bin/bash
# ============================================================
# Pax Full Restore
#
# Usage:
#   ./restore.sh                    # restore latest backup
#   ./restore.sh 2026-02-22         # restore specific date
#
# Requires:
#   - AWS CLI configured (aws configure)
#   - PAX_BACKUP_PASSPHRASE env var or macOS Keychain entry
#   - Homebrew + Node.js already installed
# ============================================================
set -euo pipefail

S3_BUCKET="pax-memory-sbdz"
OPENCLAW_DIR="/Users/pax/.openclaw"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# ── Target date ──────────────────────────────────────────────
if [[ -n "${1:-}" ]]; then
  DATE="$1"
else
  # Find the latest backup
  DATE=$(aws s3 ls "s3://$S3_BUCKET/backups/" \
    | awk '{print $2}' | tr -d '/' | sort | tail -1)
fi

if [[ -z "$DATE" ]]; then
  echo "ERROR: No backups found in s3://$S3_BUCKET/backups/" >&2
  exit 1
fi

S3_PREFIX="backups/$DATE"
echo "Restoring from: s3://$S3_BUCKET/$S3_PREFIX/"

# ── Passphrase ───────────────────────────────────────────────
if [[ -z "${PAX_BACKUP_PASSPHRASE:-}" ]]; then
  PAX_BACKUP_PASSPHRASE=$(security find-generic-password \
    -s "pax-backup" -a "pax" -w 2>/dev/null || true)
fi
if [[ -z "${PAX_BACKUP_PASSPHRASE:-}" ]]; then
  echo -n "Enter backup passphrase: "
  read -rs PAX_BACKUP_PASSPHRASE
  echo
fi

# ── Download ─────────────────────────────────────────────────
echo "Downloading backup files..."
aws s3 cp "s3://$S3_BUCKET/$S3_PREFIX/" "$TMPDIR/" --recursive

# Show manifest
echo ""
echo "=== Backup manifest ==="
cat "$TMPDIR/manifest.json" | python3 -c "
import sys, json
m = json.load(sys.stdin)
print(f'  Date:             {m[\"date\"]}')
print(f'  OpenClaw version: {m[\"openclaw_version\"]}')
print(f'  Node version:     {m[\"node_version\"]}')
"
echo ""
read -rp "Proceed with restore? This will OVERWRITE current config. (yes/no): " confirm
[[ "$confirm" != "yes" ]] && { echo "Aborted."; exit 0; }

# ── Decrypt secrets ──────────────────────────────────────────
echo "Decrypting secrets..."
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d \
  -in  "$TMPDIR/secrets.tar.gz.enc" \
  -out "$TMPDIR/secrets.tar.gz" \
  -pass "pass:$PAX_BACKUP_PASSPHRASE" \
  || { echo "ERROR: Decryption failed — wrong passphrase?" >&2; exit 1; }

# ── Stop OpenClaw if running ─────────────────────────────────
echo "Stopping OpenClaw..."
openclaw gateway stop 2>/dev/null || true
sleep 2

# ── Restore workspace ────────────────────────────────────────
echo "Restoring workspace..."
mkdir -p "$OPENCLAW_DIR"
tar -xzf "$TMPDIR/workspace.tar.gz" -C "$OPENCLAW_DIR/"

# ── Restore secrets ──────────────────────────────────────────
echo "Restoring secrets (openclaw.json + .env.local)..."
tar -xzf "$TMPDIR/secrets.tar.gz" -C "$OPENCLAW_DIR/"
# Move .env.local to workspace if it ended up in wrong place
[[ -f "$OPENCLAW_DIR/.env.local" ]] && \
  mv "$OPENCLAW_DIR/.env.local" "$OPENCLAW_DIR/workspace/.env.local" 2>/dev/null || true

# ── Restore cron jobs ────────────────────────────────────────
echo "Restoring cron jobs..."
mkdir -p "$OPENCLAW_DIR/cron"
cp "$TMPDIR/cron-jobs.json" "$OPENCLAW_DIR/cron/jobs.json"

# ── Reinstall dependencies ───────────────────────────────────
echo "Reinstalling Lambda dependencies..."
cd "$OPENCLAW_DIR/workspace/securebydezign.com/lambda" && \
  npm install --silent 2>/dev/null || echo "  (skipped — no Lambda dir)"

# ── Rebuild memory index ─────────────────────────────────────
echo "Rebuilding search index..."
cd "$OPENCLAW_DIR/workspace"
python3 memory/bin/ingest.py

# ── Start OpenClaw ───────────────────────────────────────────
echo "Starting OpenClaw..."
openclaw gateway start

echo ""
echo "✅ Restore complete from $DATE"
echo "   OpenClaw is running. Check Telegram to confirm."
