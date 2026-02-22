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
    const signature = event.headers?.Stripe-Signature ?? event.headers?.['stripe-signature'] ?? '';
    return handleWebhook(rawBody, signature);
  }

  // GET /api/session (path may include stage prefix, e.g. /prod/api/session)
  if ((path === '/api/session' || path.endsWith('/api/session')) && method === 'GET') {
    const query = getQuery(event);
    const sessionId = query.session_id ?? query['session_id'];
    return handleSession(sessionId);
  }

  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Not found' }),
  };
};
