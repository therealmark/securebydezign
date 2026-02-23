/**
 * xai-proxy.js
 * ------------
 * Proxies requests from the Mac Mini through Lambda → api.x.ai,
 * bypassing the Cloudflare ASN block on the residential IP.
 *
 * Security: every request must include the X-Proxy-Secret header
 * matching the PROXY_SECRET Lambda env var. Without it, 401.
 *
 * Usage:
 *   POST /proxy/xai
 *   Headers: X-Proxy-Secret: <secret>, Content-Type: application/json
 *   Query:   ?endpoint=chat/completions  (optional, default: chat/completions)
 *   Body:    standard xAI API JSON payload (model, messages, max_tokens, etc.)
 *
 * Returns the raw xAI API response (pass-through, including errors).
 */

import https from 'https';

const XAI_HOST    = 'api.x.ai';
const XAI_BASE    = '/v1';
const XAI_KEY     = process.env.XAI_API_KEY || '';
const PROXY_SECRET = process.env.PROXY_SECRET || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Secret',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

function httpsPost(path, payload, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: XAI_HOST,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('xAI request timed out after 30s'));
    });
    req.write(body);
    req.end();
  });
}

export async function handleXaiProxy(event) {
  // ── Auth check ────────────────────────────────────────────────────────────
  if (!PROXY_SECRET) {
    console.error('[xai-proxy] PROXY_SECRET env var not set');
    return json(500, { error: 'Proxy not configured' });
  }

  const incomingSecret =
    event.headers?.['X-Proxy-Secret'] ??
    event.headers?.['x-proxy-secret'] ??
    '';

  if (incomingSecret !== PROXY_SECRET) {
    console.warn('[xai-proxy] rejected: bad or missing X-Proxy-Secret');
    return json(401, { error: 'Unauthorized' });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let payload;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body || '{}';
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  // ── Resolve target endpoint ────────────────────────────────────────────────
  const qs = event.queryStringParameters ?? {};
  const endpoint = (qs.endpoint ?? 'chat/completions').replace(/^\/+/, '');
  const xaiPath  = `${XAI_BASE}/${endpoint}`;

  if (!XAI_KEY) {
    return json(500, { error: 'XAI_API_KEY not configured in Lambda env' });
  }

  console.log('[xai-proxy] forwarding', { path: xaiPath, model: payload.model });

  // ── Forward to xAI ────────────────────────────────────────────────────────
  try {
    const { status, body } = await httpsPost(
      xaiPath,
      payload,
      { Authorization: `Bearer ${XAI_KEY}` }
    );

    console.log('[xai-proxy] xAI responded', { status });

    // Pass through the response verbatim
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body,
    };
  } catch (err) {
    console.error('[xai-proxy] request failed', err.message);
    return json(502, { error: 'Failed to reach xAI API', detail: err.message });
  }
}
