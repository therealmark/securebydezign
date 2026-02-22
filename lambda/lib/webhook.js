/**
 * Stripe webhook: on checkout.session.completed, send email with PDFs from S3 via SES.
 */
import Stripe from 'stripe';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';

const stripe = new Stripe(config.stripeSecretKey);
const ses = new SESClient({ region: config.sesRegion });
const s3 = new S3Client({});

/**
 * Build a MIME multipart/mixed message with plain text body + PDF attachments.
 */
function buildMimeMessage(toEmail, pdfParts) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${config.sesFromEmail}`,
    `To: ${toEmail}`,
    'Subject: Your Secure by DeZign guides',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Thank you for your purchase. Your AI Security guides are attached.',
    '',
    '— Secure by DeZign',
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

/**
 * Fetch a single PDF from S3.
 */
async function getPdfFromS3(key) {
  const cmd = new GetObjectCommand({
    Bucket: config.pdfBucket,
    Key: key,
  });
  const res = await s3.send(cmd);
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Handle checkout.session.completed: email customer with all bundle PDFs attached.
 */
export async function handleWebhook(rawBody, signature) {
  let event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }

  if (event.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const session = event.data.object;
  const customerEmail = session.customer_details?.email || session.customer_email;
  if (!customerEmail) {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  if (!config.pdfBucket) {
    console.error('PDF_BUCKET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const pdfParts = [];
  for (const item of config.bundlePdfs) {
    const key = config.pdfPrefix + item.filename;
    try {
      const data = await getPdfFromS3(key);
      pdfParts.push({ filename: item.filename, data });
    } catch (e) {
      console.warn(`S3 get failed for ${key}:`, e.message);
    }
  }

  if (pdfParts.length === 0) {
    console.error('No PDFs could be loaded from S3');
    return { statusCode: 500, body: JSON.stringify({ error: 'No PDFs available' }) };
  }

  const rawMessage = buildMimeMessage(customerEmail, pdfParts);
  const sendCmd = new SendRawEmailCommand({
    Source: config.sesFromEmail,
    Destinations: [customerEmail],
    RawMessage: { Data: rawMessage },
  });
  await ses.send(sendCmd);

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
