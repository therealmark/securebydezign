/**
 * Single Lambda handler for API Gateway (REST or HTTP API).
 * Routes: POST /webhooks/stripe, GET /api/session
 */
import { handleWebhook } from './lib/webhook.js';
import { handleSession } from './lib/session.js';

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
      if (typeof event.body === 'string') {
        rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
      } else if (event.body && typeof event.body === 'object') {
        rawBody = JSON.stringify(event.body);
      } else {
        rawBody = '';
      }
      const signature = event.headers?.Stripe-Signature ?? event.headers?.['stripe-signature'] ?? '';
      const isTestRun = event.headers?.['x-stripe-webhook-test'] === 'true' || event.headers?.['X-Stripe-Webhook-Test'] === 'true';
      console.log('[Lambda] webhook', { bodyLen: rawBody?.length, hasSig: !!signature, isTestRun });
      const result = await handleWebhook(rawBody, signature, isTestRun);
      return ensureResponse(result);
    }

    // GET /api/session (path may include stage prefix, e.g. /prod/api/session)
    if ((path === '/api/session' || path.endsWith('/api/session')) && method === 'GET') {
      const query = getQuery(event);
      const sessionId = query.session_id ?? query['session_id'];
      const result = await handleSession(sessionId);
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
