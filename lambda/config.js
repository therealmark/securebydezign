/** Env-based config. Set these in Lambda environment (or .env for local). */
const BUNDLE_PDFS = [
  { filename: 'data-poisoning.pdf', title: 'Data Poisoning Defense' },
  { filename: 'api-security.pdf', title: 'Securing LLM APIs' },
  { filename: 'pinjection.pdf', title: 'Prompt Injection Attacks' },
  { filename: 'agentic-ai-security.pdf', title: 'Agentic AI Security' },
];

export const config = {
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  pdfBucket: process.env.PDF_BUCKET || '',
  pdfPrefix: (process.env.PDF_PREFIX || 'pdfs/').replace(/\/?$/, '/'),
  bundlePdfs: BUNDLE_PDFS,
  sesFromEmail: process.env.SES_FROM_EMAIL || 'hello@securebydezign.com',
  sesRegion: process.env.AWS_REGION || 'us-east-1',
  presignExpirySeconds: Number(process.env.PRESIGN_EXPIRY_SECONDS) || 300,
};
