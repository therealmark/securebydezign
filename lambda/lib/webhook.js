/**
 * Stripe webhook: on checkout.session.completed, email a pre-signed S3
 * download link to the customer. No attachments — avoids Gmail zip filtering.
 */
import Stripe from 'stripe';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { config, PRICE_PDF_MAP, PDF_TITLES, stripeKeyFor } from '../config.js';

const db = new DynamoDBClient({});
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE || 'ai-operator-customers';

const ses = new SESClient({ region: config.sesRegion });
const s3  = new S3Client({});

const LINK_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Returns product-specific email subject + body. */
function emailContentFor(filename, downloadUrl) {
  const title = PDF_TITLES[filename] ?? filename;

  if (filename === 'ai-operator-kit.zip') {
    return {
      subject: `Your AI Operator Kit is ready`,
      text: [
        `You're in.`,
        '',
        `Your AI Operator Kit is ready to download:`,
        '',
        downloadUrl,
        '',
        `This link is active for 7 days.`,
        '',
        `Your Architect will be in touch shortly to schedule your first session.`,
        `In the meantime, open the kit and get familiar with what's inside.`,
        '',
        `This is just the beginning.`,
        '',
        `— The AI Operator Team`,
        `https://ai-operator.biz`,
      ].join('\n'),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1e293b;">
          <img src="https://ai-operator.biz/images/logo.png" alt="AI Operator" style="height: 36px; margin-bottom: 32px;" />
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 8px;">You're in.</h1>
          <p style="color: #64748b; font-size: 16px; margin: 0 0 32px;">Your AI Operator Kit is ready to download.</p>
          <a href="${downloadUrl}" style="display: inline-block; background: linear-gradient(135deg, #ec4899, #a855f7); color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 16px;">
            Download Your Kit →
          </a>
          <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">Link expires in 7 days.</p>
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 32px 0;" />
          <p style="color: #64748b; font-size: 14px; margin: 0;">Your Architect will be in touch shortly to schedule your first session. In the meantime, open the kit and get familiar with what's inside.</p>
          <p style="color: #64748b; font-size: 14px; margin: 16px 0 0;">This is just the beginning.</p>
          <p style="color: #94a3b8; font-size: 13px; margin: 32px 0 0;">— The AI Operator Team · <a href="https://ai-operator.biz" style="color: #ec4899;">ai-operator.biz</a></p>
        </div>
      `,
    };
  }

  // Default fallback
  return {
    subject: `Your ${title} is ready`,
    text: [
      `Thank you for your purchase.`,
      '',
      `Download your ${title} here:`,
      '',
      downloadUrl,
      '',
      `This link is active for 7 days.`,
      '',
      `— Secure by DeZign`,
      `https://www.securebydezign.com`,
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1e293b;">
        <h2 style="margin: 0 0 16px;">Your ${title}</h2>
        <a href="${downloadUrl}" style="display: inline-block; background: #0f172a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Download Now →</a>
        <p style="color: #94a3b8; font-size: 13px; margin: 16px 0 0;">Link expires in 7 days.</p>
        <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">— Secure by DeZign · <a href="https://www.securebydezign.com" style="color: #6366f1;">securebydezign.com</a></p>
      </div>
    `,
  };
}

/**
 * Upsert a customer record in DynamoDB.
 * Increments purchaseCount, appends product to products list,
 * sets firstPurchaseAt on first purchase, updates lastPurchaseAt always.
 */
async function captureCustomer({ email, name, businessName, productName, stripeCustomerId }) {
  if (!email) return;
  const now = new Date().toISOString();

  try {
    await db.send(new UpdateItemCommand({
      TableName: CUSTOMERS_TABLE,
      Key: { email: { S: email } },
      UpdateExpression: [
        'SET #name = if_not_exists(#name, :name)',
        '#firstPurchaseAt = if_not_exists(#firstPurchaseAt, :now)',
        '#lastPurchaseAt = :now',
        '#stripeCustomerId = if_not_exists(#stripeCustomerId, :scid)',
        '#businessName = if_not_exists(#businessName, :biz)',
        'ADD #purchaseCount :one, #products :product',
      ].join(', '),
      ExpressionAttributeNames: {
        '#name': 'name',
        '#firstPurchaseAt': 'firstPurchaseAt',
        '#lastPurchaseAt': 'lastPurchaseAt',
        '#stripeCustomerId': 'stripeCustomerId',
        '#businessName': 'businessName',
        '#purchaseCount': 'purchaseCount',
        '#products': 'products',
      },
      ExpressionAttributeValues: {
        ':name': { S: name || 'Unknown' },
        ':now':  { S: now },
        ':scid': { S: stripeCustomerId || '' },
        ':biz':  { S: businessName || '' },
        ':one':  { N: '1' },
        ':product': { SS: [productName || 'unknown'] },
      },
    }));
    console.log(`[webhook] Customer captured: ${email}`);
  } catch (err) {
    // Non-fatal — log but don't fail the webhook
    console.error('[webhook] Failed to capture customer:', err.message);
  }
}

export async function handleWebhook(rawBody, signature) {
  if (!config.stripeWebhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook not configured' }) };
  }

  // Try live secret first, fall back to test secret.
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

  // Expand line items to identify purchased product
  let fullSession;
  try {
    fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items.data.price'],
    });
  } catch (e) {
    console.error('[webhook] Failed to retrieve session line items:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not retrieve session' }) };
  }

  const priceId    = fullSession.line_items?.data?.[0]?.price?.id;
  const pdfFilename = priceId ? PRICE_PDF_MAP[priceId] : null;

  if (!pdfFilename) {
    console.warn('[webhook] Unknown price ID, cannot determine asset:', priceId);
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  // Generate pre-signed S3 download URL (7-day expiry)
  const key = config.pdfPrefix + pdfFilename;
  let downloadUrl;
  try {
    const command = new GetObjectCommand({
      Bucket: config.pdfBucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${pdfFilename}"`,
    });
    downloadUrl = await getSignedUrl(s3, command, { expiresIn: LINK_EXPIRY_SECONDS });
  } catch (e) {
    console.error(`[webhook] Failed to generate pre-signed URL for ${key}:`, e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Asset not found' }) };
  }

  // Send email with download link (no attachment)
  const { subject, text, html } = emailContentFor(pdfFilename, downloadUrl);
  try {
    await ses.send(new SendEmailCommand({
      Source: config.sesFromEmail,
      Destination: { ToAddresses: [customerEmail] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: text, Charset: 'UTF-8' },
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    }));
    console.log(`[webhook] Emailed download link for ${pdfFilename} to ${customerEmail}`);
  } catch (err) {
    console.error('[webhook] SES send failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email' }) };
  }

  // Capture customer data (non-fatal — runs after email success)
  const customerName = session.customer_details?.name || fullSession.customer_details?.name || '';
  const businessName = session.metadata?.businessName || fullSession.metadata?.businessName || '';
  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : '';
  await captureCustomer({
    email: customerEmail,
    name: customerName,
    businessName,
    productName: pdfFilename,
    stripeCustomerId,
  });

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
