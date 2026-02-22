# Stripe checkout → PDF email + auto-download (S3-hosted)

The site is **static on S3** (no server). PDF delivery uses **Node.js Lambda** behind API Gateway.

## Current flow

1. **Checkout:** Stripe Payment Link or Stripe.js → one product “Full Guide” $27.
2. **Success URL:** `https://www.securebydezign.com/success.html?session_id={CHECKOUT_SESSION_ID}` (set in Stripe).
3. **Webhook:** Stripe sends `checkout.session.completed` to your API → **Lambda** reads PDFs from **S3**, attaches them to an email, sends via **SES**.
4. **Success page:** JS calls `GET /api/session?session_id=...` → Lambda verifies session with Stripe and returns **presigned S3 URLs** → page triggers **auto-download** for each PDF and shows “We’ve emailed your guides to …”.

## Architecture

- **S3 (static):** HTML, CSS, JS, images. No backend code.
- **S3 (PDFs):** Separate bucket or prefix, **private**. PDFs are only delivered via Lambda (email attachment + presigned URL).
- **Lambda (Node.js):**
  - `POST /webhooks/stripe` — On `checkout.session.completed`, send one email (SES) with all bundle PDFs from S3.
  - `GET /api/session?session_id=cs_xxx` — Verify session, return `{ email, downloads: [ { name, filename, url } ] }` with presigned S3 URLs.
- **API Gateway:** Exposes the two routes and forwards to the Lambda (proxy integration; webhook body must stay raw for Stripe signature).

## What you need

1. **Stripe:** Success URL with `{CHECKOUT_SESSION_ID}`; webhook to `https://YOUR_API_URL/webhooks/stripe` for `checkout.session.completed`.
2. **S3 PDF bucket:** Private bucket (or prefix) with the four PDFs; Lambda role has `s3:GetObject`.
3. **SES:** Verified sender (e.g. `hello@securebydezign.com`).
4. **Success page:** Set `window.SECUREBYDEZIGN_API = 'https://YOUR_API_URL'` (no trailing slash) so the script calls your Lambda API. If the API is on the same origin as the site (e.g. custom domain with /api routed to API Gateway), you can leave it unset.

Code: **`lambda/`** (Node.js), **`success.html`** (calls API and triggers downloads). See **`lambda/README.md`** for env vars, IAM, and deploy steps.
