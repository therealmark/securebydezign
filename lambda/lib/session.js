/**
 * GET /api/session?session_id=cs_xxx
 * Verify Stripe checkout session and return customer email + presigned S3 URL
 * for the specific PDF that was purchased.
 */
import Stripe from 'stripe';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config, PRICE_PDF_MAP, PDF_TITLES, stripeKeyFor } from '../config.js';
const s3 = new S3Client({});

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

export async function handleSession(sessionId) {
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return json(400, { error: 'Invalid session_id' });
  }

  // Pick key based on session mode (cs_test_ = test, cs_live_ = live)
  const isLive = sessionId.startsWith('cs_live_');
  const stripe = new Stripe(stripeKeyFor(isLive));

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer_details', 'line_items.data.price'],
    });
  } catch (e) {
    return json(404, { error: 'Session not found' });
  }

  if (session.payment_status !== 'paid') {
    return json(403, { error: 'Payment not completed' });
  }

  const email = session.customer_details?.email || session.customer_email || '';

  // Resolve purchased PDF from line items
  const priceId = session.line_items?.data?.[0]?.price?.id;
  const pdfFilename = priceId ? PRICE_PDF_MAP[priceId] : null;

  if (!pdfFilename) {
    console.warn('[session] Unknown price ID or no line items:', priceId);
    return json(200, { email, downloads: [] });
  }

  if (!config.pdfBucket) {
    return json(200, { email, downloads: [] });
  }

  const key = config.pdfPrefix + pdfFilename;
  try {
    const cmd = new GetObjectCommand({
      Bucket: config.pdfBucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${pdfFilename}"`,
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: config.presignExpirySeconds });
    return json(200, {
      email,
      downloads: [{ name: PDF_TITLES[pdfFilename] || pdfFilename, filename: pdfFilename, url }],
    });
  } catch (e) {
    console.error(`[session] Presign failed for ${key}:`, e.message);
    return json(500, { error: 'Could not generate download link' });
  }
}
