# PDF API — Node.js Lambda (S3-hosted site)

Static site stays on **S3**; this Lambda handles Stripe webhook (email PDFs) and session API (verified download URLs) via **API Gateway**.

## Flow

1. User pays with Stripe → redirect to `success.html?session_id=cs_xxx`.
2. **Webhook** (`POST /webhooks/stripe`): Stripe sends `checkout.session.completed` → Lambda emails all bundle PDFs to the customer (SES), using PDFs from **S3**.
3. **Session** (`GET /api/session?session_id=cs_xxx`): Lambda verifies the session with Stripe and returns `{ email, downloads: [ { name, filename, url } ] }` where each `url` is a **presigned S3 URL** (short-lived). Success page calls this and triggers auto-download for each URL.

## S3 layout

- **Site (public):** Your existing S3 bucket for the static site (HTML, CSS, JS). No PDFs here if you want them protected.
- **PDFs (private):** A second S3 bucket (or a prefix in the same bucket) that holds the PDFs. Lambda needs read access.

Example:

- Bucket: `securebydezign-pdfs` (private)
- Keys: `pdfs/pinjection.pdf`, `pdfs/api-security.pdf`, `pdfs/data-poisoning.pdf`, `pdfs/agentic-ai-security.pdf`

Upload the same PDFs you generate with `generate-article-pdfs.js` into this bucket.

## Environment (Lambda)

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key. |
| `STRIPE_WEBHOOK_SECRET` | Yes (webhook) | From Stripe Dashboard → Webhooks → Signing secret. |
| `PDF_BUCKET` | Yes | S3 bucket name where PDFs are stored. |
| `PDF_PREFIX` | No | S3 key prefix (default `pdfs/`). Final key = `PDF_PREFIX` + filename. |
| `SES_FROM_EMAIL` | No | Sender (default `hello@securebydezign.com`). Must be verified in SES. |
| `AWS_REGION` | Set by Lambda | Used for SES and S3. |
| `PRESIGN_EXPIRY_SECONDS` | No | Presigned URL TTL (default 300). |

## IAM (Lambda execution role)

- **S3:** `s3:GetObject` on `arn:aws:s3:::PDF_BUCKET/PDF_PREFIX*`
- **SES:** `ses:SendRawEmail`

## Stripe

1. **Success URL** (Payment Link or Checkout):  
   `https://www.securebydezign.com/success.html?session_id={CHECKOUT_SESSION_ID}`

2. **Webhook:** Add endpoint `https://YOUR_API_GATEWAY_URL/webhooks/stripe`, event `checkout.session.completed`. Use the signing secret as `STRIPE_WEBHOOK_SECRET`.

## Deploy (high level)

1. Build: `cd lambda && npm install` (and optionally bundle for smaller deploy, e.g. esbuild).
2. Create Lambda (Node 18+), set env vars, attach IAM role above.
3. Create API Gateway (REST or HTTP API):
   - `POST /webhooks/stripe` → Lambda (do **not** transform request body; use Lambda proxy so body stays raw for Stripe signature).
   - `GET /api/session` → same Lambda.
4. Enable CORS for your site origin (`https://www.securebydezign.com`) if needed; the handler returns `Access-Control-Allow-Origin: *` for GET /api/session.
5. Set **success page** `window.SECUREBYDEZIGN_API = 'https://YOUR_API_GATEWAY_URL'` (no trailing slash) so the success page calls your API.

## Local test (optional)

Use Stripe CLI to forward webhooks:

```bash
stripe listen --forward-to localhost:9999/webhooks/stripe
```

Run a small local server that forwards to your deployed Lambda, or use SAM/Serverless offline.
