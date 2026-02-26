/**
 * Stripe webhook: on checkout.session.completed, email the specific purchased
 * file to the customer via SES.
 */
import Stripe from 'stripe';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config, PRICE_PDF_MAP, PDF_TITLES, stripeKeyFor } from '../config.js';
const ses = new SESClient({ region: config.sesRegion });
const s3 = new S3Client({});

/** Returns MIME type based on file extension. */
function mimeTypeFor(filename) {
  if (filename.endsWith('.zip'))  return 'application/zip';
  if (filename.endsWith('.pdf'))  return 'application/pdf';
  return 'application/octet-stream';
}

/** Returns product-specific email subject + body. */
function emailContentFor(filename) {
  if (filename === 'ai-operator-kit.zip') {
    return {
      subject: "Your AI Operator Kit is here 🎉",
      body: [
        "You're in. Your AI Operator Kit is attached — everything you need to get started.",
        '',
        "Your coach will be in touch shortly to schedule your first 1-on-1 session.",
        "In the meantime, take a look inside the kit and get familiar with what's there.",
        '',
        "This is just the beginning.",
        '',
        '— The AI Operator Team',
        'https://ai-operator.securebydezign.com',
      ].join('\n'),
    };
  }
  // Default: security guide
  return {
    subject: 'Your Secure by DeZign guide',
    body: [
      'Thank you for your purchase. Your AI Security guide is attached.',
      '',
      '— Secure by DeZign',
      'https://www.securebydezign.com',
    ].join('\n'),
  };
}

function buildMimeMessage(toEmail, parts) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const { subject, body } = emailContentFor(parts[0]?.filename ?? '');
  const lines = [
    `From: ${config.sesFromEmail}`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ];
  for (const { filename, data } of parts) {
    const base64 = Buffer.from(data).toString('base64');
    const mime = mimeTypeFor(filename);
    lines.push(
      `--${boundary}`,
      `Content-Type: ${mime}; name="${filename}"`,
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

  // Try live secret first, fall back to test secret.
  // We don't know livemode until after signature verification, so we try both.
  let event;
  const secrets = [config.stripeLiveWebhookSecret, config.stripeWebhookSecret].filter(Boolean);
  for (const secret of secrets) {
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
      break;
    } catch (_) {}
  }
  if (!event) {
    console.error('[webhook] Signature verification failed against all known secrets');
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid webhook signature' }) };
  }

  if (event.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  // Pick key based on event mode
  const stripe = new Stripe(stripeKeyFor(event.livemode));

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
    return { statusCode: 500, body: JSON.stringify({ error: 'Asset not found' }) };
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
