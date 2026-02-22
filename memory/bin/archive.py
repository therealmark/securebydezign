#!/usr/bin/env python3
"""
Archive memory files older than HOT_DAYS to S3 cold storage.
Maintains a searchable index.json in S3.
Runs weekly via cron.

Usage: python3 memory/bin/archive.py [--dry-run] [--days 90]
"""
import os, sys, json, gzip, re, argparse, subprocess
from pathlib import Path
from datetime import date, timedelta

WORKSPACE  = Path(__file__).resolve().parents[2]
MEMORY_DIR = WORKSPACE / 'memory'
S3_BUCKET  = 'pax-memory-sbdz'
S3_PREFIX  = 'archive/'
HOT_DAYS   = 90   # files older than this get archived

def get_date_from_file(filepath: Path):
    m = re.search(r'(\d{4}-\d{2}-\d{2})', filepath.name)
    if m:
        return date.fromisoformat(m.group(1))
    mtime = filepath.stat().st_mtime
    import datetime as dt
    return dt.date.fromtimestamp(mtime)

def extract_summary(text: str, max_chars=300):
    """Pull a short summary from the markdown content."""
    # Skip headings and get the first meaningful paragraph
    lines = [l.strip() for l in text.splitlines() if l.strip() and not l.startswith('#')]
    summary = ' '.join(lines)[:max_chars]
    return summary + ('…' if len(summary) == max_chars else '')

def extract_title(text: str, fallback: str):
    m = re.search(r'^#{1,2}\s+(.+)$', text, re.MULTILINE)
    return m.group(1) if m else fallback

def load_s3_index():
    result = subprocess.run(
        ['aws', 's3', 'cp', f's3://{S3_BUCKET}/index.json', '-'],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        try:
            return json.loads(result.stdout)
        except Exception:
            pass
    return []

def save_s3_index(index: list, dry_run=False):
    data = json.dumps(index, indent=2).encode()
    if dry_run:
        print(f"[dry-run] Would update s3://{S3_BUCKET}/index.json ({len(index)} entries)")
        return
    proc = subprocess.run(
        ['aws', 's3', 'cp', '-',
         f's3://{S3_BUCKET}/index.json',
         '--content-type', 'application/json'],
        input=data, capture_output=True
    )
    if proc.returncode != 0:
        print(f"[archive] Failed to update index: {proc.stderr.decode()}", file=sys.stderr)

def archive_file(filepath: Path, file_date: date, dry_run=False):
    text    = filepath.read_text(encoding='utf-8', errors='replace')
    title   = extract_title(text, filepath.stem)
    summary = extract_summary(text)
    s3_key  = f"{S3_PREFIX}{file_date.year}/{filepath.name}.gz"

    if dry_run:
        print(f"[dry-run] Would archive {filepath.name} → s3://{S3_BUCKET}/{s3_key}")
        return {'date': file_date.isoformat(), 'title': title, 'summary': summary, 'key': s3_key}

    compressed = gzip.compress(text.encode('utf-8'))
    proc = subprocess.run(
        ['aws', 's3', 'cp', '-',
         f's3://{S3_BUCKET}/{s3_key}',
         '--content-type', 'application/gzip',
         '--content-encoding', 'gzip'],
        input=compressed, capture_output=True
    )
    if proc.returncode != 0:
        print(f"[archive] Upload failed for {filepath.name}: {proc.stderr.decode()}", file=sys.stderr)
        return None

    print(f"[archive] ✓ {filepath.name} → s3://{S3_BUCKET}/{s3_key}")
    return {'date': file_date.isoformat(), 'title': title, 'summary': summary, 'key': s3_key}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--days', type=int, default=HOT_DAYS)
    args = parser.parse_args()

    cutoff   = date.today() - timedelta(days=args.days)
    index    = load_s3_index()
    archived = {e['key'] for e in index}
    new_entries = []

    candidates = sorted(MEMORY_DIR.glob('*.md'))
    for filepath in candidates:
        file_date = get_date_from_file(filepath)
        if file_date >= cutoff:
            continue  # still hot

        s3_key = f"{S3_PREFIX}{file_date.year}/{filepath.name}.gz"
        if s3_key in archived:
            print(f"[archive] Already archived: {filepath.name}")
            continue

        entry = archive_file(filepath, file_date, dry_run=args.dry_run)
        if entry:
            new_entries.append(entry)

    if new_entries:
        index.extend(new_entries)
        save_s3_index(index, dry_run=args.dry_run)
        print(f"\n[archive] {len(new_entries)} file(s) archived, index updated.")
    else:
        print("[archive] Nothing to archive.")

if __name__ == '__main__':
    main()
