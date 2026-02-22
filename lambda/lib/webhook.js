/**
 * Stripe webhook: on checkout.session.completed, email the specific purchased
 * PDF to the customer via SES.
 */
import Stripe from 'stripe';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config, PRICE_PDF_MAP, PDF_TITLES } from '../config.js';

const stripe = new Stripe(config.stripeSecretKey);
const ses = new SESClient({ region: config.sesRegion });
const s3 = new S3Client({});

function buildMimeMessage(toEmail, pdfParts) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${config.sesFromEmail}`,
    `To: ${toEmail}`,
    'Subject: Your Secure by DeZign guide',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Thank you for your purchase. Your AI Security guide is attached.',
    '',
    '— Secure by DeZign',
    'https://www.securebydezign.com',
  ];
  for (const { filename, data } of pdfParts) {
    const base64 = Buffer.from(data).toString('base64');
    lines.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      base64.replace(/(.{76})/g, '$1\n'),
      ''
    );
  }
  lines.push(`--${boundary}--`, '');
  return Buffer.from(lines.join('\r\n'), 'utf8');
}

async function getPdfFromS3(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.pdfBucket, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function handleWebhook(rawBody, signature) {
  if (!config.stripeWebhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook not configured' }) };
  }

  let event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }

  if (event.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const session = event.data.object;
  const customerEmail = session.customer_details?.email || session.customer_email;
  if (!customerEmail) {
    console.warn('[webhook] No customer email in session');
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  if (!config.pdfBucket) {
    console.error('[webhook] PDF_BUCKET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // Retrieve session with line items to identify which PDF was purchased
  let fullSession;
  try {
    fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items.data.price'],
    });
  } catch (e) {
    console.error('[webhook] Failed to retrieve session line items:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not retrieve session' }) };
  }

  const priceId = fullSession.line_items?.data?.[0]?.price?.id;
  const pdfFilename = priceId ? PRICE_PDF_MAP[priceId] : null;

  if (!pdfFilename) {
    console.warn('[webhook] Unknown price ID, cannot determine PDF:', priceId);
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const key = config.pdfPrefix + pdfFilename;
  let pdfData;
  try {
    pdfData = await getPdfFromS3(key);
  } catch (e) {
    console.error(`[webhook] S3 get failed for ${key}:`, e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'PDF not found' }) };
  }

  try {
    const rawMessage = buildMimeMessage(customerEmail, [{ filename: pdfFilename, data: pdfData }]);
    await ses.send(new SendRawEmailCommand({
      Source: config.sesFromEmail,
      Destinations: [customerEmail],
      RawMessage: { Data: rawMessage },
    }));
    console.log(`[webhook] Emailed ${pdfFilename} to ${customerEmail}`);
  } catch (err) {
    console.error('[webhook] SES send failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
