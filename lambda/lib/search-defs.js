/**
 * GET /api/search-defs?q=...  — semantic search over attack definitions
 * POST /api/search-defs       — body: { "q": "..." }
 *
 * Loads metadata + embeddings from S3, embeds the query via OpenAI,
 * returns top-N results ranked by cosine similarity.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.PDF_BUCKET || 'securebydezign.com';
const MODEL  = 'text-embedding-3-small';
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

async function embedQuery(q) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: q }),
  });
  if (!res.ok) throw new Error(`OpenAI embedding error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
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

export async function handleSearchDefs(event) {
  // Parse query from GET or POST
  let q = '';
  const method = (event.httpMethod ?? event.requestContext?.http?.method ?? '').toUpperCase();
  if (method === 'GET') {
    q = (event.queryStringParameters?.q ?? '').trim();
  } else if (method === 'POST') {
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      q = (body?.q ?? '').trim();
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
    const [{ meta, emb }, queryVec] = await Promise.all([getStore(), embedQuery(q)]);

    const scored = meta
      .filter(d => emb[d.id])
      .map(d => ({ ...d, score: cosine(queryVec, emb[d.id]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N)
      .map(({ score, ...rest }) => ({ ...rest, score: Math.round(score * 1000) / 1000 }));

    return json(200, { q, results: scored, total: meta.length });
  } catch (err) {
    console.error('[search-defs] error', err);
    return json(500, { error: 'Search failed. Please try again.' });
  }
}
