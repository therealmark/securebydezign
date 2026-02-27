/**
 * Customer management API.
 *
 * GET    /api/customers          — list all customers
 * POST   /api/customers          — upsert customer (create or update)
 * DELETE /api/customers?email=x  — delete customer
 *
 * All endpoints require X-Metrics-Key header.
 */
import {
  DynamoDBClient,
  ScanCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';

const db = new DynamoDBClient({});
const TABLE     = process.env.CUSTOMERS_TABLE || 'ai-operator-customers';
const VALID_KEY = process.env.METRICS_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-metrics-key',
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function authError()  { return json(401, { error: 'Unauthorized' }); }
function serverError(e) {
  console.error('[customers] error:', e);
  return json(500, { error: 'Internal server error' });
}

/** Safely convert any value DynamoDB/unmarshall might give us into a plain JS Array */
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (val instanceof Set) return [...val];
  if (typeof val === 'object' && Symbol.iterator in val) return [...val];
  return [];
}

/** Normalise a raw DynamoDB-unmarshalled customer record into a safe plain object */
function normalise(raw) {
  return {
    email:           raw.email          || '',
    name:            raw.name           || '',
    businessName:    raw.businessName   || '',
    notes:           raw.notes          || '',
    stripeCustomerId:raw.stripeCustomerId || '',
    purchaseCount:   typeof raw.purchaseCount === 'number' ? raw.purchaseCount : 0,
    products:        toArray(raw.products),
    firstPurchaseAt: raw.firstPurchaseAt || '',
    lastPurchaseAt:  raw.lastPurchaseAt  || '',
    createdAt:       raw.createdAt       || raw.firstPurchaseAt || '',
  };
}

// ── GET /api/customers ─────────────────────────────────────────────────────────
async function listCustomers(event) {
  const q      = event.queryStringParameters || {};
  const search = (q.search || '').toLowerCase().trim();

  let items = [];
  let lastKey;
  // Paginate through entire table (customer count will always be small)
  do {
    const result = await db.send(new ScanCommand({
      TableName:         TABLE,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  let customers = items.map(i => normalise(unmarshall(i)));

  if (search) {
    customers = customers.filter(c =>
      c.email.toLowerCase().includes(search) ||
      c.name.toLowerCase().includes(search) ||
      c.businessName.toLowerCase().includes(search) ||
      c.notes.toLowerCase().includes(search)
    );
  }

  // Sort newest first
  customers.sort((a, b) => {
    const ta = a.lastPurchaseAt || a.firstPurchaseAt || '';
    const tb = b.lastPurchaseAt || b.firstPurchaseAt || '';
    return tb.localeCompare(ta);
  });

  // Summary stats
  const totalPurchases = customers.reduce((s, c) => s + c.purchaseCount, 0);
  const productCounts  = {};
  customers.forEach(c => c.products.forEach(p => {
    productCounts[p] = (productCounts[p] || 0) + 1;
  }));
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return json(200, {
    summary: {
      totalCustomers: customers.length,
      totalPurchases,
      topProducts,
    },
    customers,
  });
}

// ── POST /api/customers ────────────────────────────────────────────────────────
async function upsertCustomer(event) {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const email = (body.email || '').toLowerCase().trim();
  if (!email) return json(400, { error: 'email is required' });

  const now = new Date().toISOString();

  // Build update expression dynamically — only update provided fields
  const setExprs  = [];
  const addExprs  = [];
  const exprNames = {};
  const exprVals  = {};

  // Always touch lastUpdated
  setExprs.push('#updatedAt = :updatedAt');
  exprNames['#updatedAt'] = 'updatedAt';
  exprVals[':updatedAt']  = { S: now };

  // First purchase timestamp (only if not already set)
  setExprs.push('#firstPurchaseAt = if_not_exists(#firstPurchaseAt, :now)');
  exprNames['#firstPurchaseAt'] = 'firstPurchaseAt';
  exprVals[':now']              = { S: now };

  if (body.name !== undefined) {
    setExprs.push('#name = :name');
    exprNames['#name'] = 'name';
    exprVals[':name']  = { S: body.name || '' };
  }
  if (body.businessName !== undefined) {
    setExprs.push('#businessName = :businessName');
    exprNames['#businessName'] = 'businessName';
    exprVals[':businessName']  = { S: body.businessName || '' };
  }
  if (body.notes !== undefined) {
    setExprs.push('#notes = :notes');
    exprNames['#notes'] = 'notes';
    exprVals[':notes']  = { S: body.notes || '' };
  }
  if (body.stripeCustomerId !== undefined) {
    setExprs.push('#scid = if_not_exists(#scid, :scid)');
    exprNames['#scid'] = 'stripeCustomerId';
    exprVals[':scid']  = { S: body.stripeCustomerId || '' };
  }

  // purchaseCount increment (optional)
  if (body.incrementPurchase) {
    addExprs.push('#purchaseCount :one');
    setExprs.push('#lastPurchaseAt = :now');
    exprNames['#purchaseCount']   = 'purchaseCount';
    exprNames['#lastPurchaseAt']  = 'lastPurchaseAt';
    exprVals[':one']              = { N: '1' };
  }

  // Add a product to the set
  if (body.product) {
    addExprs.push('#products :product');
    exprNames['#products'] = 'products';
    exprVals[':product']   = { SS: [body.product] };
  }

  const parts = [];
  if (setExprs.length)  parts.push('SET ' + setExprs.join(', '));
  if (addExprs.length)  parts.push('ADD ' + addExprs.join(', '));

  await db.send(new UpdateItemCommand({
    TableName:                 TABLE,
    Key:                       { email: { S: email } },
    UpdateExpression:          parts.join(' '),
    ExpressionAttributeNames:  exprNames,
    ExpressionAttributeValues: exprVals,
  }));

  // Return the updated record
  const result = await db.send(new GetItemCommand({
    TableName: TABLE,
    Key:       { email: { S: email } },
  }));
  const customer = result.Item ? normalise(unmarshall(result.Item)) : { email };

  return json(200, { ok: true, customer });
}

// ── DELETE /api/customers?email=x ─────────────────────────────────────────────
async function deleteCustomer(event) {
  const q     = event.queryStringParameters || {};
  const email = (q.email || '').toLowerCase().trim();
  if (!email) return json(400, { error: 'email query param is required' });

  await db.send(new DeleteItemCommand({
    TableName: TABLE,
    Key:       { email: { S: email } },
  }));

  return json(200, { ok: true });
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function handleCustomers(event) {
  const headers = event.headers || {};
  const key     = headers['x-metrics-key'] || headers['X-Metrics-Key'];
  if (!VALID_KEY || key !== VALID_KEY) return authError();

  const method = (event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();

  try {
    if (method === 'GET')    return await listCustomers(event);
    if (method === 'POST')   return await upsertCustomer(event);
    if (method === 'DELETE') return await deleteCustomer(event);
    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return serverError(e);
  }
}
