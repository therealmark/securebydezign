/**
 * GET /api/search-defs?q=...  — semantic search over attack definitions
 * POST /api/search-defs       — body: { "q": "..." }
 *
 * Loads precomputed embeddings from S3 and returns top matches.
 * Embeddings are generated offline via sentence-transformers.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.PDF_BUCKET || 'securebydezign.com';
const TOP_N  = 8;

// In-memory cache (warm Lambda reuse)
let _meta = null;
let _emb  = null;

async function loadS3Json(key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const res = await s3.send(cmd);
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function getStore() {
  if (!_meta || !_emb) {
    [_meta, _emb] = await Promise.all([
      loadS3Json('data/definitions-meta.json'),
      loadS3Json('data/definitions-embeddings.json'),
    ]);
    console.log(`[search-defs] loaded ${_meta.length} definitions, ${Object.keys(_emb).length} embeddings`);
  }
  return { meta: _meta, emb: _emb };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function json(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      ...extra,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Simple keyword-based fallback when no query embedding is provided.
 * Searches term + short description for keyword matches.
 */
function keywordSearch(meta, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return meta
    .map(d => {
      const text = `${d.term} ${d.short}`.toLowerCase();
      const matches = terms.filter(t => text.includes(t)).length;
      return { ...d, score: matches / terms.length };
    })
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);
}

export async function handleSearchDefs(event) {
  // Parse query from GET or POST
  let q = '';
  let queryVec = null;
  
  const method = (event.httpMethod ?? event.requestContext?.http?.method ?? '').toUpperCase();
  if (method === 'GET') {
    q = (event.queryStringParameters?.q ?? '').trim();
  } else if (method === 'POST') {
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      q = (body?.q ?? '').trim();
      queryVec = body?.embedding; // optional: client can send pre-computed embedding
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }
  }

  if (!q || q.length < 2) {
    return json(400, { error: 'Query too short. Minimum 2 characters.' });
  }
  if (q.length > 500) {
    return json(400, { error: 'Query too long. Maximum 500 characters.' });
  }

  try {
    const { meta, emb } = await getStore();

    let scored;
    
    if (queryVec && Array.isArray(queryVec) && queryVec.length > 0) {
      // Semantic search using provided embedding
      scored = meta
        .filter(d => emb[d.id])
        .map(d => ({ ...d, score: cosine(queryVec, emb[d.id]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_N)
        .map(({ score, ...rest }) => ({ ...rest, score: Math.round(score * 1000) / 1000 }));
    } else {
      // Fallback: keyword search
      scored = keywordSearch(meta, q);
    }

    return json(200, { 
      q, 
      results: scored, 
      total: meta.length,
      method: queryVec ? 'semantic' : 'keyword'
    });
  } catch (err) {
    console.error('[search-defs] error', err);
    return json(500, { error: 'Search failed. Please try again.' });
  }
}
