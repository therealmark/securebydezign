import Stripe from 'stripe';

const [,, MODE = 'test', SLUG, FILE, ...TITLE_PARTS] = process.argv;
const TITLE = TITLE_PARTS.join(' ');
const KEY   = process.env.STRIPE_KEY;

if (!KEY || !SLUG || !FILE || !TITLE) {
  console.error('Usage: STRIPE_KEY=sk_... node stripe-setup.mjs [test|live] <slug> <file-name> <title>');
  process.exit(1);
}

const SUCCESS_URL = 'https://sidekick.securebydezign.com/success.html?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL  = 'https://sidekick.securebydezign.com/';

const AMOUNT = Number(process.env.DONATION_AMOUNT || 2500);
const stripe = new Stripe(KEY);

console.log(`Creating ${MODE} product for ${TITLE} (${SLUG})`);

const product = await stripe.products.create({ name: TITLE, metadata: { slug: SLUG, file: FILE } });
const price   = await stripe.prices.create({ product: product.id, unit_amount: AMOUNT, currency: 'usd' });
const link    = await stripe.paymentLinks.create({
  line_items: [{ price: price.id, quantity: 1 }],
  after_completion: { type: 'redirect', redirect: { url: SUCCESS_URL } },
  metadata: { slug: SLUG, file: FILE }
});

console.log('\nDone.');
console.log(`Product: ${product.id}`);
console.log(`Price:   ${price.id}`);
console.log(`Link:    ${link.url}`);
console.log('\nAdd to lambda/config.js PRICE_PDF_MAP:');
console.log(`  '${price.id}': '${FILE}', // ${MODE} — ${SLUG}`);
console.log('\nAdd to js/stripe-checkout.js maps:');
console.log(`  PAYMENT_LINKS.${MODE} = '${link.url}';`);
