/**
 * Creates a Stripe product + price + payment link for a single new article.
 *
 * Usage:
 *   STRIPE_KEY=sk_test_... node stripe-setup.mjs test <slug> <pdf-filename> <article-title>
 *   STRIPE_KEY=sk_live_... node stripe-setup.mjs live <slug> <pdf-filename> <article-title>
 *
 * Example:
 *   STRIPE_KEY=sk_test_... node stripe-setup.mjs test zero-trust-ai zero-trust-ai.pdf "Zero Trust for AI Systems"
 *
 * Outputs the price ID and payment link to add to:
 *   - lambda/config.js  (PRICE_PDF_MAP)
 *   - js/stripe-checkout.js  (TEST / LIVE maps)
 *   - js/owner-unlock.js     (PDF_MAP)
 */
import Stripe from 'stripe';

const [,, MODE = 'test', SLUG, PDF, ...TITLE_PARTS] = process.argv;
const TITLE = TITLE_PARTS.join(' ');
const KEY   = process.env.STRIPE_KEY;

if (!KEY || !SLUG || !PDF || !TITLE) {
  console.error('Usage: STRIPE_KEY=sk_... node stripe-setup.mjs [test|live] <slug> <pdf-filename> <article title>');
  console.error('Example: STRIPE_KEY=sk_test_... node stripe-setup.mjs test zero-trust-ai zero-trust-ai.pdf "Zero Trust for AI Systems"');
  process.exit(1);
}

const SUCCESS_URL  = 'https://www.securebydezign.com/success.html?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_BASE  = 'https://www.securebydezign.com/articles/';
const stripe       = new Stripe(KEY);

console.log(`\nCreating ${MODE} Stripe product for: ${TITLE} (${SLUG})\n`);

const product = await stripe.products.create({
  name:     TITLE,
  metadata: { slug: SLUG, pdf: PDF },
});

const price = await stripe.prices.create({
  product:     product.id,
  unit_amount: 2700,
  currency:    'usd',
});

const link = await stripe.paymentLinks.create({
  line_items: [{ price: price.id, quantity: 1 }],
  after_completion: {
    type:     'redirect',
    redirect: { url: SUCCESS_URL },
  },
  metadata: { slug: SLUG, pdf: PDF },
});

console.log('✓ Done!\n');
console.log(`Product ID : ${product.id}`);
console.log(`Price ID   : ${price.id}`);
console.log(`Pay Link   : ${link.url}`);
console.log(`\n── Add to lambda/config.js → PRICE_PDF_MAP ─────────────────────────`);
console.log(`  '${price.id}': '${PDF}',  // ${MODE} — ${SLUG}`);
console.log(`\n── Add to js/stripe-checkout.js → ${MODE.toUpperCase()} map ───────────────────────`);
console.log(`  '${SLUG}': '${link.url}',`);
console.log(`\n── Add to js/owner-unlock.js → PDF_MAP ──────────────────────────────`);
console.log(`  '${SLUG}': '/pdfs/${PDF}',`);
