#!/usr/bin/env python3
"""
Search conversation memory — hot tier (SQLite FTS5) first, cold tier (S3) if sparse.

Usage:
  python3 memory/bin/search.py "stripe webhook"
  python3 memory/bin/search.py "stripe webhook" --limit 10
  python3 memory/bin/search.py "stripe webhook" --cold    # force include S3 search

Output is structured for easy reading mid-session.
"""
import sqlite3, sys, os, json, gzip, re, argparse
from pathlib import Path
from datetime import date, timedelta

WORKSPACE  = Path(__file__).resolve().parents[2]
MEMORY_DIR = WORKSPACE / 'memory'
DB_PATH    = MEMORY_DIR / 'hot.db'
S3_BUCKET  = 'pax-memory-sbdz'
HOT_THRESH = 5   # if fewer than this many hot results, also search cold

def search_hot(query: str, limit: int = 8):
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT date, source, title,
                   snippet(memory, 4, '>>>', '<<<', ' … ', 40) as excerpt
            FROM memory
            WHERE content MATCH ?
            ORDER BY rank
            LIMIT ?
        """, (query, limit))
        rows = cur.fetchall()
    except Exception as e:
        rows = []
        print(f"[search] Hot query error: {e}", file=sys.stderr)
    conn.close()
    return rows

def search_cold(query: str, limit: int = 5):
    """Download S3 index and grep for query terms in archived filenames + summaries."""
    try:
        import subprocess, json as _json
        # Pull the cold index file
        result = subprocess.run(
            ['aws', 's3', 'cp', f's3://{S3_BUCKET}/index.json', '-'],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            return []

        index = _json.loads(result.stdout)
        terms = [t.lower() for t in query.split()]
        hits  = []
        for entry in index:
            text = (entry.get('title','') + ' ' + entry.get('summary','')).lower()
            if any(t in text for t in terms):
                hits.append(entry)
                if len(hits) >= limit:
                    break
        return hits
    except Exception as e:
        print(f"[search] Cold search error: {e}", file=sys.stderr)
        return []

def print_results(hot_rows, cold_hits, query):
    print(f"\n{'='*60}")
    print(f"  Memory search: \"{query}\"")
    print(f"{'='*60}\n")

    if hot_rows:
        print(f"── HOT (local, {len(hot_rows)} result{'s' if len(hot_rows)!=1 else ''}) ─────────────────────\n")
        for date_, source, title, excerpt in hot_rows:
            print(f"  [{date_}] {title}")
            print(f"  Source: {source}")
            print(f"  {excerpt.strip()}")
            print()
    else:
        print("  No hot results. Run: python3 memory/bin/ingest.py\n")

    if cold_hits:
        print(f"── COLD (S3, {len(cold_hits)} result{'s' if len(cold_hits)!=1 else ''}) ─────────────────────\n")
        for h in cold_hits:
            print(f"  [{h.get('date','?')}] {h.get('title','?')}")
            print(f"  S3 key: {h.get('key','?')}")
            print(f"  {h.get('summary','')[:200]}")
            print()

    if not hot_rows and not cold_hits:
        print("  No results found in hot or cold storage.\n")

    print(f"{'='*60}\n")

def main():
    parser = argparse.ArgumentParser(description='Search Pax memory storage')
    parser.add_argument('query', help='Search query')
    parser.add_argument('--limit', type=int, default=8, help='Max results (default 8)')
    parser.add_argument('--cold', action='store_true', help='Always include S3 cold search')
    args = parser.parse_args()

    hot  = search_hot(args.query, args.limit)
    cold = []
    if args.cold or len(hot) < HOT_THRESH:
        cold = search_cold(args.query)

    print_results(hot, cold, args.query)

if __name__ == '__main__':
    main()
