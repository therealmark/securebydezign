/** Env-based config. Set these in Lambda environment. */

// Maps Stripe price IDs → PDF filename (test + live)
export const PRICE_PDF_MAP = {
  // ── TEST ──────────────────────────────────────────────────────────────────
  'price_1T3hMKBSD7Ij1cUSBOknTQ4t': 'supply-chain-ai.pdf',
  'price_1T3hMLBSD7Ij1cUSyzVmqVB7': 'llm-red-teaming.pdf',
  'price_1T3hMMBSD7Ij1cUSpzQ3oZBY': 'api-security.pdf',
  'price_1T3hMNBSD7Ij1cUS4DfMb9V3': 'data-poisoning.pdf',
  'price_1T3hMOBSD7Ij1cUSimNXPXnP': 'model-inversion.pdf',
  'price_1T3hMPBSD7Ij1cUS4xAZnY3u': 'pinjection.pdf',
  'price_1T3hMQBSD7Ij1cUSrlDQSOGn': 'agentic-ai-security.pdf',
  'price_1T3jN4BSD7Ij1cUSs4Bkug3E': 'enterprise-agentic-security.pdf',

  // ── LIVE ──────────────────────────────────────────────────────────────────
  'price_1T3hSEB50TQ4M7eDLwmSbW3y': 'supply-chain-ai.pdf',
  'price_1T3hSFB50TQ4M7eDuTnw7AIY': 'llm-red-teaming.pdf',
  'price_1T3hSGB50TQ4M7eD5MC83ZtW': 'api-security.pdf',
  'price_1T3hSHB50TQ4M7eDYsT86ymz': 'data-poisoning.pdf',
  'price_1T3hSHB50TQ4M7eDrUTZxNHT': 'model-inversion.pdf',
  'price_1T3hSIB50TQ4M7eDya2ws2sO': 'pinjection.pdf',
  'price_1T3hSJB50TQ4M7eDqd926TEt': 'agentic-ai-security.pdf',
  'price_1T3jN8B50TQ4M7eD6YQppz0e': 'enterprise-agentic-security.pdf',
};

// PDF display names for email
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
  stripeSecretKey:          process.env.STRIPE_SECRET_KEY          || '',  // test key
  stripeLiveSecretKey:      process.env.STRIPE_LIVE_SECRET_KEY     || '',  // live key
  stripeWebhookSecret:      process.env.STRIPE_WEBHOOK_SECRET      || '',  // test webhook secret
  stripeLiveWebhookSecret:  process.env.STRIPE_LIVE_WEBHOOK_SECRET || '',  // live webhook secret
  pdfBucket,
  pdfPrefix,
  sesFromEmail:         process.env.SES_FROM_EMAIL         || 'hello@securebydezign.com',
  sesRegion:            process.env.AWS_REGION             || 'us-east-1',
  presignExpirySeconds: Number(process.env.PRESIGN_EXPIRY_SECONDS) || 300,
};

/** Returns the correct Stripe secret key for a given session/event (test vs live). */
export function stripeKeyFor(isLive) {
  return isLive ? (config.stripeLiveSecretKey || config.stripeSecretKey) : config.stripeSecretKey;
}
