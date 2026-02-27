/**
 * Analytics event ingestion + summary API
 */
import { DynamoDBClient, PutItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const db    = new DynamoDBClient({});
const TABLE = process.env.ANALYTICS_TABLE || 'ai-operator-analytics';
const METRICS_KEY = process.env.METRICS_API_KEY || '';

// ── Track: POST /api/track ───────────────────────────────────────────────────
export async function handleTrack(body, headers) {
  let event;
  try { event = typeof body === 'string' ? JSON.parse(body) : body; }
  catch { return { statusCode: 400, body: '{"error":"bad json"}' }; }

  if (!event.sid || !event.type) {
    return { statusCode: 400, body: '{"error":"missing sid or type"}' };
  }

  // Enrich with server-side data
  const ip      = headers['x-forwarded-for']?.split(',')[0]?.trim() || '';
  const country = headers['cloudfront-viewer-country'] || headers['x-country'] || '';
  const city    = headers['cloudfront-viewer-city'] || '';
  const date    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const item = {
    pk:          `${event.sid}#${event.ts || new Date().toISOString()}`,
    sk:          event.type,
    date,
    sid:         event.sid        || '',
    vid:         event.vid        || '',
    isNew:       event.isNew      ?? true,
    type:        event.type,
    page:        event.page       || '/',
    referrer:    event.referrer   || '',
    utmSrc:      event.utmSrc     || '',
    utmMed:      event.utmMed     || '',
    utmCamp:     event.utmCamp    || '',
    utmTerm:     event.utmTerm    || '',
    utmCont:     event.utmCont    || '',
    ua:          event.ua         || '',
    lang:        event.lang       || '',
    screen:      event.screen     || '',
    device:      event.device     || '',
    duration:    event.duration   || 0,
    scrollDepth: event.scrollDepth || 0,
    label:       event.label      || '',
    country,
    city,
    ip,
    ts:          event.ts || new Date().toISOString(),
  };

  await db.send(new PutItemCommand({
    TableName: TABLE,
    Item: marshall(item),
  }));

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '{"ok":true}',
  };
}

// ── Summary: GET /api/analytics ─────────────────────────────────────────────
export async function handleAnalytics(headers) {
  const key = headers['x-metrics-key'] || '';
  if (!METRICS_KEY || key !== METRICS_KEY) {
    return { statusCode: 401, body: '{"error":"unauthorized"}' };
  }

  // Scan all events (replace with GSI queries for scale)
  const result = await db.send(new ScanCommand({ TableName: TABLE }));
  const events = (result.Items || []).map(i => unmarshall(i));

  // Aggregate
  const sessions   = {};
  const referrers  = {};
  const devices    = {};
  const countries  = {};
  const utmSources = {};
  const pages      = {};
  const clicks     = {};
  let   totalEvents = 0;

  for (const e of events) {
    totalEvents++;
    if (e.sid) sessions[e.sid] = sessions[e.sid] || { ...e, events: [] };
    if (e.sid) sessions[e.sid].events = sessions[e.sid].events || [];
    if (e.sid) sessions[e.sid].events.push(e.type);

    if (e.referrer) { const r = new URL(e.referrer, 'http://x').hostname || e.referrer; referrers[r] = (referrers[r] || 0) + 1; }
    if (e.device)   devices[e.device]      = (devices[e.device] || 0) + 1;
    if (e.country)  countries[e.country]   = (countries[e.country] || 0) + 1;
    if (e.utmSrc)   utmSources[e.utmSrc]   = (utmSources[e.utmSrc] || 0) + 1;
    if (e.page)     pages[e.page]           = (pages[e.page] || 0) + 1;
    if (e.type === 'click' && e.label) clicks[e.label] = (clicks[e.label] || 0) + 1;
  }

  const sessionList = Object.values(sessions);
  const totalSessions = sessionList.length;
  const newVisitors = sessionList.filter(s => s.isNew).length;
  const avgDuration = Math.round(
    sessionList.reduce((sum, s) => sum + (s.duration || 0), 0) / (totalSessions || 1)
  );
  const avgScroll = Math.round(
    sessionList.reduce((sum, s) => sum + (s.scrollDepth || 0), 0) / (totalSessions || 1)
  );
  const ctaClicks = Object.values(clicks).reduce((a, b) => a + b, 0);
  const ctaRate = totalSessions ? Math.round((ctaClicks / totalSessions) * 100) : 0;

  // Recent sessions (last 20)
  const recent = sessionList
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 20)
    .map(s => ({
      sid:      s.sid.slice(0, 8),
      ts:       s.ts,
      device:   s.device,
      country:  s.country,
      referrer: s.referrer,
      utmSrc:   s.utmSrc,
      page:     s.page,
      isNew:    s.isNew,
      duration: s.duration,
      scroll:   s.scrollDepth,
      events:   s.events,
    }));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      summary: { totalSessions, newVisitors, totalEvents, avgDuration, avgScroll, ctaRate, ctaClicks },
      referrers:  top(referrers),
      devices:    top(devices),
      countries:  top(countries),
      utmSources: top(utmSources),
      pages:      top(pages),
      clicks,
      recent,
    }),
  };
}

function top(obj, n = 10) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ name: k, count: v }));
}
