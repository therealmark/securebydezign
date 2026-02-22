# Test the flow with your Payment Link

Use this to get the Lambda and success page working end-to-end with:

**Payment Link:** https://buy.stripe.com/aFadR8gDw2jm4UM6atb7y00

---

## Step 1: Set the Payment Link success URL (Stripe Dashboard)

Stripe must redirect to your success page **with** the session ID. Otherwise the success page never gets `session_id` and can't call the Lambda.

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Product catalog** → **Payment links**.
2. Open the link that goes to `buy.stripe.com/aFadR8gDw2jm4UM6atb7y00` (or find it by that URL).
3. Click **Update** or **⋯** → **Edit**.
4. Under **After payment** / **Confirmation page**, set **Success URL** to:
   ```text
   https://www.securebydezign.com/success.html?session_id={CHECKOUT_SESSION_ID}
   ```
   Use your real domain if different. The `{CHECKOUT_SESSION_ID}` part is required; Stripe replaces it with the real session ID.
5. Save.

After this, when someone completes checkout, they’ll land on your success page with `?session_id=cs_...` in the URL.

---

## Step 2: Do a test transaction

1. In Stripe Dashboard, turn **Test mode** on (top right).
2. Open the Payment Link in a browser:  
   https://buy.stripe.com/aFadR8gDw2jm4UM6atb7y00  
   (Use the test link if you have a separate test Payment Link.)
3. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
4. After payment, you should be redirected to:
   ```text
   https://www.securebydezign.com/success.html?session_id=cs_test_...
   ```
5. If the URL has **no** `session_id`, go back to Step 1 and fix the success URL.

---

## Step 3: Set the API URL on the success page

The success page must know your Lambda’s API Gateway URL.

- If you deploy the site yourself (e.g. S3/Amplify), add this **before** the success script (or in a small inline script at the top of the page):
  ```html
  <script>window.SECUREBYDEZIGN_API = 'https://YOUR_API_GATEWAY_URL';</script>
  ```
  Replace `YOUR_API_GATEWAY_URL` with your real URL, e.g.:
  - REST API: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod` (include the stage, e.g. `prod`).
  - HTTP API: `https://abc123xyz.execute-api.us-east-1.amazonaws.com` (no stage).
- No trailing slash.

If you don’t control the HTML (e.g. only Stripe-hosted page), you can’t set this; the site must be under your domain with this script added.

---

## Step 4: Check the success page after a test buy

1. Do another test payment so you land on the success page with `?session_id=cs_test_...`.
2. On the success page you should see either:
   - **“We've emailed your guides to …”** and downloads starting, or
   - A short error/debug line under the main message (we added this to help).
3. Use the debug line:
   - **“No session ID in URL”** → Step 1: fix Payment Link success URL.
   - **“API URL not set”** → Step 3: set `SECUREBYDEZIGN_API`.
   - **“Error: 404”** or **“Error: Failed to fetch”** → API Gateway URL wrong, or Lambda/route not deployed, or CORS.
   - **“Error: 403”** → Session not paid or invalid (try a fresh test payment).
   - **“Error: 500”** → Check Lambda logs in CloudWatch (env vars, Stripe key, S3 bucket, etc.).

---

## Step 5: Test the Lambda directly (optional)

To confirm the Lambda works without the browser:

1. After a test payment, copy the full success URL (including `session_id=cs_test_...`).
2. In AWS Lambda console, open your function → **Test** tab.
3. Create a test event with this shape (use your real `session_id` from the URL):

**REST API (proxy):**
```json
{
  "httpMethod": "GET",
  "path": "/api/session",
  "queryStringParameters": { "session_id": "cs_test_PASTE_HERE" },
  "headers": {}
}
```

**HTTP API:**
```json
{
  "requestContext": { "http": { "method": "GET", "path": "/api/session" } },
  "queryStringParameters": { "session_id": "cs_test_PASTE_HERE" },
  "headers": {}
}
```

4. Run the test. You want status 200 and a body with `email` and `downloads`. If you get 403/404, the session might be expired or not paid; run a new test payment and use that new `session_id`.

---

## Checklist

- [ ] Payment Link success URL is `...success.html?session_id={CHECKOUT_SESSION_ID}`.
- [ ] One test payment and redirect has `session_id=cs_test_...` in the URL.
- [ ] `window.SECUREBYDEZIGN_API` is set to your API Gateway URL (no trailing slash).
- [ ] Lambda env: `STRIPE_SECRET_KEY`, `PDF_BUCKET` (and `STRIPE_WEBHOOK_SECRET` for email).
- [ ] API Gateway has `GET /api/session` → Lambda (and CORS if the site is on another origin).
- [ ] Success page shows either success message + downloads or a clear debug error.

Once these are in place, the Payment Link and Lambda flow should work for test (and live) transactions.
