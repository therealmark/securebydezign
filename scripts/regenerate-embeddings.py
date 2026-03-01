#!/usr/bin/env python3
"""
regenerate-embeddings.py
Regenerate all definition embeddings using open-source sentence-transformers.
Replaces OpenAI embeddings with local model (all-MiniLM-L6-v2).

Run: python3 scripts/regenerate-embeddings.py

Requirements:
  pip install sentence-transformers
"""
import json
from pathlib import Path
from sentence_transformers import SentenceTransformer

ROOT = Path('/Users/pax/.openclaw/workspace/securebydezign.com')
META_FILE = ROOT / 'data' / 'definitions-meta.json'
EMB_FILE  = ROOT / 'data' / 'definitions-embeddings.json'

MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2'  # 384 dimensions

print(f"Loading model: {MODEL_NAME}")
model = SentenceTransformer(MODEL_NAME)

print(f"Loading definitions from {META_FILE}")
defs = json.loads(META_FILE.read_text())
print(f"Found {len(defs)} definitions")

# Generate embeddings for each definition
# Using same format as Lambda: "term: short description"
texts = [f"{d['term']}: {d['short']}" for d in defs]
ids = [d['id'] for d in defs]

print(f"Generating embeddings (batch processing)...")
embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

# Convert to dict format matching existing structure
emb_dict = {id_: emb.tolist() for id_, emb in zip(ids, embeddings)}

print(f"Writing {len(emb_dict)} embeddings to {EMB_FILE}")
EMB_FILE.write_text(json.dumps(emb_dict, ensure_ascii=False))

print(f"\n✅ Done. Generated {len(emb_dict)} embeddings using {MODEL_NAME}")
print(f"   Embedding dimensions: {len(embeddings[0])}")
print(f"   Output: {EMB_FILE}")
