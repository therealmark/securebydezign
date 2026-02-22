/** Env-based config. Set these in Lambda environment (or .env for local). */
const BUNDLE_PDFS = [
  { filename: 'data-poisoning.pdf', title: 'Data Poisoning Defense' },
  { filename: 'api-security.pdf', title: 'Securing LLM APIs' },
  { filename: 'pinjection.pdf', title: 'Prompt Injection Attacks' },
  { filename: 'agentic-ai-security.pdf', title: 'Agentic AI Security' },
];

// If PDF_BUCKET looks like s3://bucket-name/path/, parse out bucket and prefix
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
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  pdfBucket,
  pdfPrefix,
  bundlePdfs: BUNDLE_PDFS,
  sesFromEmail: process.env.SES_FROM_EMAIL || 'hello@securebydezign.com',
  sesRegion: process.env.AWS_REGION || 'us-east-1',
  presignExpirySeconds: Number(process.env.PRESIGN_EXPIRY_SECONDS) || 300,
};
