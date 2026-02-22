/** Env-based config. Set these in Lambda environment (or .env for local). */

// Maps Stripe price IDs → PDF filename.
// Add live price IDs here once live products are created.
export const PRICE_PDF_MAP = {
  // ── TEST ──────────────────────────────────────────────────────────────────
  'price_1T3hMKBSD7Ij1cUSBOknTQ4t': 'supply-chain-ai.pdf',
  'price_1T3hMLBSD7Ij1cUSyzVmqVB7': 'llm-red-teaming.pdf',
  'price_1T3hMMBSD7Ij1cUSpzQ3oZBY': 'api-security.pdf',
  'price_1T3hMNBSD7Ij1cUS4DfMb9V3': 'data-poisoning.pdf',
  'price_1T3hMOBSD7Ij1cUSimNXPXnP': 'model-inversion.pdf',
  'price_1T3hMPBSD7Ij1cUS4xAZnY3u': 'pinjection.pdf',
  'price_1T3hMQBSD7Ij1cUSrlDQSOGn': 'agentic-ai-security.pdf',

  // ── LIVE ──────────────────────────────────────────────────────────────────
  // Populated after live products are created (see stripe-setup.mjs live run)
};

// PDF titles for email attachments (filename → display name)
export const PDF_TITLES = {
  'supply-chain-ai.pdf':    'AI Supply Chain Security',
  'llm-red-teaming.pdf':    'AI Red Teaming: Enterprise LLM Security Playbook 2026',
  'api-security.pdf':       'Securing LLM APIs',
  'data-poisoning.pdf':     'Defending Against Data Poisoning',
  'model-inversion.pdf':    'Model Inversion Attacks',
  'pinjection.pdf':         'Prompt Injection Attacks & Defenses',
  'agentic-ai-security.pdf':'Agentic AI Security',
};

function parsePdfBucketEnv() {
  const raw = (process.env.PDF_BUCKET || '').trim();
  if (!raw) return { bucket: '', prefix: 'pdfs/' };
  const match = raw.match(/^s3:\/\/([^/]+)\/?(.*)?\/?$/);
  if (match) {
    const prefix = (match[2] || 'pdfs/').replace(/\/?$/, '/');
    return { bucket: match[1], prefix };
  }
  return { bucket: raw.replace(/\/+$/, ''), prefix: (process.env.PDF_PREFIX || 'pdfs/').replace(/\/?$/, '/') };
}

const { bucket: pdfBucket, prefix: pdfPrefix } = parsePdfBucketEnv();

export const config = {
  stripeSecretKey:      process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret:  process.env.STRIPE_WEBHOOK_SECRET || '',
  pdfBucket,
  pdfPrefix,
  sesFromEmail:         process.env.SES_FROM_EMAIL || 'hello@securebydezign.com',
  sesRegion:            process.env.AWS_REGION || 'us-east-1',
  presignExpirySeconds: Number(process.env.PRESIGN_EXPIRY_SECONDS) || 300,
};
