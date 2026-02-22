#!/usr/bin/env python3
"""
Ingest all memory markdown files into the local SQLite FTS5 hot store.
Run after writing any new memory file, or daily via cron.

Usage: python3 memory/bin/ingest.py
"""
import sqlite3, os, re, sys
from datetime import datetime, date
from pathlib import Path

WORKSPACE   = Path(__file__).resolve().parents[2]
MEMORY_DIR  = WORKSPACE / 'memory'
DB_PATH     = MEMORY_DIR / 'hot.db'
CHUNK_SIZE  = 800   # characters per indexed chunk (overlap is fine)

def chunk_text(text, size=CHUNK_SIZE):
    """Split text into overlapping chunks for better search coverage."""
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]
    chunks, current = [], []
    length = 0
    for para in paragraphs:
        if length + len(para) > size and current:
            chunks.append('\n\n'.join(current))
            current, length = [], 0
        current.append(para)
        length += len(para)
    if current:
        chunks.append('\n\n'.join(current))
    return chunks or [text[:size]]

def ingest_file(cursor, filepath: Path):
    source = str(filepath.relative_to(WORKSPACE))
    text   = filepath.read_text(encoding='utf-8', errors='replace')

    # Extract date from filename (YYYY-MM-DD.md) or use file mtime
    m = re.search(r'(\d{4}-\d{2}-\d{2})', filepath.name)
    doc_date = m.group(1) if m else date.fromtimestamp(filepath.stat().st_mtime).isoformat()

    # Extract a title (first H1/H2 or filename)
    title_m = re.search(r'^#{1,2}\s+(.+)$', text, re.MULTILINE)
    title   = title_m.group(1) if title_m else filepath.stem

    # Remove existing entries for this source
    cursor.execute("DELETE FROM memory WHERE source = ?", (source,))

    for i, chunk in enumerate(chunk_text(text)):
        cursor.execute(
            "INSERT INTO memory (date, source, title, chunk_idx, content) VALUES (?,?,?,?,?)",
            (doc_date, source, title, i, chunk)
        )

def main():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    cur.executescript("""
        CREATE VIRTUAL TABLE IF NOT EXISTS memory USING fts5(
            date,
            source,
            title,
            chunk_idx UNINDEXED,
            content,
            tokenize='porter ascii'
        );
    """)

    ingested = 0
    # Ingest MEMORY.md
    memory_md = WORKSPACE / 'MEMORY.md'
    if memory_md.exists():
        ingest_file(cur, memory_md)
        ingested += 1

    # Ingest all memory/*.md files
    for f in sorted(MEMORY_DIR.glob('*.md')):
        ingest_file(cur, f)
        ingested += 1

    conn.commit()
    conn.close()
    print(f"[ingest] Indexed {ingested} files into {DB_PATH}")

if __name__ == '__main__':
    main()
