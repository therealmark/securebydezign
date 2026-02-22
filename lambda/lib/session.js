/**
 * GET /api/session?session_id=cs_xxx
 * Verify Stripe checkout session and return customer email + presigned S3 download URLs.
 */
import Stripe from 'stripe';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

const stripe = new Stripe(config.stripeSecretKey);
const s3 = new S3Client({});

export async function handleSession(sessionId) {
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid session_id' }) };
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer_details'],
    });
  } catch (e) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Session not found' }) };
  }

  if (session.payment_status !== 'paid') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Payment not completed' }) };
  }

  const email = session.customer_details?.email || session.customer_email || '';

  if (!config.pdfBucket) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ email, downloads: [] }),
    };
  }

  const downloads = [];
  for (const item of config.bundlePdfs) {
    const key = config.pdfPrefix + item.filename;
    try {
      const cmd = new GetObjectCommand({
        Bucket: config.pdfBucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${item.filename}"`,
      });
      const url = await getSignedUrl(s3, cmd, { expiresIn: config.presignExpirySeconds });
      downloads.push({
        name: item.title,
        filename: item.filename,
        url,
      });
    } catch (e) {
      console.warn(`Presign failed for ${key}:`, e.message);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ email, downloads }),
  };
}
