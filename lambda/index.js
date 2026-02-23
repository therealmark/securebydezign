/**
 * Single Lambda handler for API Gateway (REST or HTTP API).
 * Routes: POST /webhooks/stripe, GET /api/session
 */
import { handleWebhook } from './lib/webhook.js';
import { handleSession } from './lib/session.js';
import { handleXaiProxy } from './lib/xai-proxy.js';
import { handleSearchDefs } from './lib/search-defs.js';

function getPath(event) {
  return event.path ?? event.rawPath ?? event.requestContext?.http?.path ?? '';
}

function getMethod(event) {
  return (event.httpMethod ?? event.requestContext?.http?.method ?? '').toUpperCase();
}

function getQuery(event) {
  return event.queryStringParameters ?? {};
}

export const handler = async (event) => {
  const path = getPath(event);
  const method = getMethod(event);
  console.log('[Lambda] invoked', { path, method, hasBody: !!event.body, isBase64: !!event.isBase64Encoded });

  try {
    // CORS preflight
    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
        },
        body: '',
      };
    }

    // POST /webhooks/stripe (path may include stage prefix, e.g. /prod/webhooks/stripe)
    if ((path === '/webhooks/stripe' || path.endsWith('/webhooks/stripe')) && method === 'POST') {
      let rawBody;
      if (event.isBase64Encoded && event.body) {
        rawBody = Buffer.from(event.body, 'base64').toString('utf8');
      } else {
        rawBody = typeof event.body === 'string' ? event.body : (event.body && Buffer.from(event.body).toString('utf8')) || '';
      }
      const signature = event.headers?.['Stripe-Signature'] ?? event.headers?.['stripe-signature'] ?? '';
      console.log('[Lambda] webhook', { bodyLen: rawBody?.length, hasSig: !!signature });
      const result = await handleWebhook(rawBody, signature);
      return ensureResponse(result);
    }

    // GET /api/session (path may include stage prefix, e.g. /prod/api/session)
    if ((path === '/api/session' || path.endsWith('/api/session')) && method === 'GET') {
      const query = getQuery(event);
      const sessionId = query.session_id ?? query['session_id'];
      const result = await handleSession(sessionId);
      return ensureResponse(result);
    }

    // GET|POST /api/search-defs — semantic search over attack definition database
    if (path === '/api/search-defs' || path.endsWith('/api/search-defs')) {
      if (method === 'OPTIONS') {
        return {
          statusCode: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
          body: '',
        };
      }
      const result = await handleSearchDefs(event);
      return ensureResponse(result);
    }

    // POST /proxy/xai — proxies to api.x.ai bypassing Cloudflare ASN block
    if ((path === '/proxy/xai' || path.endsWith('/proxy/xai')) && method === 'POST') {
      const result = await handleXaiProxy(event);
      return ensureResponse(result);
    }

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (err) {
    console.error('[Lambda] unhandled error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

function ensureResponse(result) {
  if (!result || typeof result.statusCode !== 'number') {
    return { statusCode: 500, body: JSON.stringify({ error: 'Invalid response' }) };
  }
  return {
    ...result,
    body: typeof result.body === 'string' ? result.body : JSON.stringify(result.body || {}),
  };
}
