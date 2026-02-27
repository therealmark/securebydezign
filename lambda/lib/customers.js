/**
 * Customer management API.
 * GET /api/customers — list all customers (key-protected)
 * Uses the same X-Metrics-Key auth as /api/analytics.
 */
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const db = new DynamoDBClient({});
const TABLE = process.env.CUSTOMERS_TABLE || 'ai-operator-customers';
const VALID_KEY = process.env.METRICS_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-metrics-key',
};

function authError() {
  return {
    statusCode: 401,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
}

export async function handleCustomers(event) {
  const headers = event.headers || {};
  const key = headers['x-metrics-key'] || headers['X-Metrics-Key'];
  if (!VALID_KEY || key !== VALID_KEY) return authError();

  const query = event.queryStringParameters || {};
  const search = (query.search || '').toLowerCase().trim();
  const limitParam = parseInt(query.limit || '500', 10);

  try {
    // Full scan — customer list is small enough
    const result = await db.send(new ScanCommand({
      TableName: TABLE,
      Limit: 1000,
    }));

    let customers = (result.Items || []).map(item => unmarshall(item));

    // Optional search filter
    if (search) {
      customers = customers.filter(c =>
        (c.email || '').toLowerCase().includes(search) ||
        (c.name || '').toLowerCase().includes(search) ||
        (c.businessName || '').toLowerCase().includes(search)
      );
    }

    // Sort by most recent purchase first
    customers.sort((a, b) => {
      const ta = a.lastPurchaseAt || a.firstPurchaseAt || '';
      const tb = b.lastPurchaseAt || b.firstPurchaseAt || '';
      return tb.localeCompare(ta);
    });

    // Apply limit after filter/sort
    const limited = customers.slice(0, limitParam);

    // Summary stats
    const totalPurchases = customers.reduce((sum, c) => sum + (c.purchaseCount || 0), 0);
    const productCounts = {};
    customers.forEach(c => {
      (c.products || []).forEach(p => {
        productCounts[p] = (productCounts[p] || 0) + 1;
      });
    });
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: {
          totalCustomers: customers.length,
          totalPurchases,
          topProducts,
        },
        customers: limited,
      }),
    };
  } catch (err) {
    console.error('[customers] error:', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
