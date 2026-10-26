# Drip & Dusk checkout server — sandbox foundation

The public Vercel/Sites storefront remains an explicit **browser-local checkout preview**. This server is prepared for a merchant-owned Razorpay test account. It has not been deployed to an authenticated Cloudflare account and has not processed a real Razorpay test payment. WhatsApp and a courier are not connected. `COMMERCE_MODE=live` is rejected; changing a key prefix is not a supported launch path.

## Try it locally

Use Node 24 or newer with `node:sqlite` support. No package installation is needed for the local server or tests.

```sh
node --test tests/*.test.mjs
node backend/dev-server.mjs
```

Open `http://127.0.0.1:4173`. The local API uses an in-memory SQLite database with a D1-compatible adapter, sample stock and **local-only simulated payments**. The public static preview can still be served with `python3 -m http.server 4174 --bind 127.0.0.1 --directory dist`.

In the local API preview, the owner key is `local-demo-owner-key-for-development-only`. It is rejected by no special backdoor: it is simply the local development server's default environment value, never used by the Worker deployment. Set your own `ADMIN_SECRET` for any sandbox environment. Local sample orders disappear on server restart. `LOCAL_DB_PATH` can select a local SQLite file; provide a stable random `TRACKING_SECRET` if retaining it. Real customer information must not be entered in the preview; the API preview replaces submitted address data with an example before saving.

## Connect Razorpay test mode

1. Create the business's own Razorpay account and generate **test** API keys. Enable automatic capture for the integration and subscribe the test webhook to `payment.captured` and/or `order.paid`.
2. Copy `.dev.vars.example` to `.dev.vars` and replace every placeholder. Keep it ignored by Git. Generate separate random tracking, admin, payment-webhook and courier secrets; do not reuse them. Node can load the local file with `node --env-file=backend/.dev.vars backend/dev-server.mjs`.
3. Use `COMMERCE_MODE=sandbox`, a `rzp_test_…` key ID, key secret and a separate webhook secret of at least 32 characters. Do not paste secrets into chat, `dist/`, GitHub or screenshots.
4. Configure `PUBLIC_ORIGIN` to exactly the checkout origin. Configure explicit PIN-prefix shipping rules in paise, in priority order. An unmatched PIN is not serviceable. Rates are fixed merchant configuration in this release, not a live courier quote. The sample rules are not approved business rates.
5. Configure the Razorpay webhook to `https://YOUR_CHECKOUT_DOMAIN/api/webhooks/razorpay`, using the same webhook secret. Use a deployed HTTPS sandbox to receive provider callbacks; localhost is not reachable by Razorpay.
6. Complete a merchant-authorized sandbox purchase in Razorpay's official test interface, check the provider dashboard, verify the duplicate callback behavior and verify the saved order. Automated tests use mocked provider responses; they do not prove that an account's capture settings or webhook configuration work.

All monetary calculations use integer paise on the server. The browser sends variant IDs and quantities. A quote lasts 10 minutes; creating a payment order reserves stock for 15 minutes. A database transaction reserves all lines or none. Expired holds release stock on API activity and the scheduled cleanup. Captured payment deducts stock once through a conditional order transition and a SQL trigger. Payment signatures use the **stored** gateway order ID; callback verification also fetches the payment and validates its ID, order, currency, amount and captured status. A browser success message alone cannot confirm an order.

A captured payment arriving after its reservation expires becomes `payment_review / captured_unallocated`; it does not silently oversell released stock. The owner must resolve allocation/refund in the payment dashboard. An ambiguous gateway timeout is not retried with a new gateway order; its reservation expires safely. Automatic refunds, cancellations, returns and payment reconciliation beyond callbacks remain launch work.

## Optional Cloudflare sandbox deployment

A merchant-owned Cloudflare account is needed. Install/use the official Wrangler CLI when ready, sign in as the account owner and create a D1 database. No account, paid plan or external service is provisioned by this repository.

```sh
npx wrangler d1 create drip-and-dusk-orders --config backend/wrangler.jsonc
# Copy the returned database_id into backend/wrangler.jsonc.
npx wrangler d1 migrations apply drip-and-dusk-orders --remote --config backend/wrangler.jsonc
node backend/seed.mjs > /tmp/drip-dusk-test-seed.sql
npx wrangler d1 execute drip-and-dusk-orders --remote --file /tmp/drip-dusk-test-seed.sql --config backend/wrangler.jsonc
npx wrangler secret put TRACKING_SECRET --config backend/wrangler.jsonc
npx wrangler secret put ADMIN_SECRET --config backend/wrangler.jsonc
npx wrangler secret put RAZORPAY_KEY_ID --config backend/wrangler.jsonc
npx wrangler secret put RAZORPAY_KEY_SECRET --config backend/wrangler.jsonc
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET --config backend/wrangler.jsonc
npx wrangler secret put SHIPPING_RULES_JSON --config backend/wrangler.jsonc
npx wrangler deploy --config backend/wrangler.jsonc
```

Replace `PUBLIC_ORIGIN` with the real HTTPS sandbox origin and keep `COMMERCE_MODE=sandbox`. Set the origin after the initial Worker URL is known, then redeploy. Secrets go through Wrangler's hidden prompts, not shell arguments. The demo seed inserts only absent variants; it never overwrites existing inventory. It is **sample inventory**, not stock imported from the seller. Do not import it into a real merchant database.

The Worker serves the same `dist/` assets and overrides `/commerce-config.mjs` with API mode. Keep frontend/API on this same origin; cross-origin checkout is intentionally unsupported. Static Vercel hosting alone cannot run this D1 backend. Preserve the existing public demo until sandbox verification is complete.

## Owner access and private tracking

Connected `/#admin` uses server authentication for order data. Sign in with the server's owner access key. The API sets a one-hour `HttpOnly`, `SameSite=Strict` cookie (`Secure` on HTTPS). Sign out clears it. This is a single-owner sandbox mechanism, not multi-user role management or a production identity service. No owner secret is stored in browser local storage.

Tracking URLs use a fragment: `/#track/ORDER_ID/TOKEN`. Tokens are 256-bit HMAC values derived from a server secret and random order ID. Tracking API calls use the token in an Authorization header and return no customer name, address or phone number. Responses are `no-store`; the storefront uses `no-referrer`. Anyone holding the full link can view the order's products/status, so treat the link as private. Secret rotation invalidates existing tracking links.

The owner's order list contains fulfilment details and must remain protected. Browser-local catalogue editing is not enabled on the connected storefront. Shared catalogue CRUD, outside-sale synchronization, image uploads, backups, a retention/deletion policy and production owner authentication remain separate launch work. The test database stores sandbox delivery information; use only example details until those policies are ready.

## WhatsApp confirmation

The integration targets Meta's direct Cloud API, avoiding a mandatory third-party messaging subscription. It does not bypass Meta's charges or template approval. It sends a confirmation only after verified capture, only after explicit checkout opt-in, and independently of order persistence.

Set `WHATSAPP_API_VERSION` to the supported version on your Meta app, `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE`, and the exact approved language code. The template must have **three positional body variables**, matching this proposed wording (submit for approval before use):

> Drip & Dusk: order {{1}} is confirmed. Total {{2}}. Track your order: {{3}}. Contact us if you need help with your order.

For a merchant-authorized test recipient only, explicitly set `ALLOW_SANDBOX_MESSAGES=true`. Its default is false. Configure `/api/webhooks/whatsapp` with `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` to verify the callback and record delivery/failure status. No messages have been sent by the development workflow.

The outbox queues one confirmation per order, leases work and retries request failures up to five attempts. A request can be accepted externally while its response is lost; **exactly-once WhatsApp delivery is not guaranteed**. Review uncertain/repeated deliveries in Meta. Payment/order confirmation is not rolled back if notification delivery fails. This release sends the confirmation and tracking link, not a separate WhatsApp notification for every courier stage.

## Courier connection

No courier is chosen, so there is no fabricated courier integration or automatic shipment booking. The owner can mark a captured, confirmed order Packed and attach the real courier shipment ID. A provider-specific trusted adapter must then map the selected courier's signed callbacks to the bridge contract:

```json
{"eventId":"unique-provider-event","shipmentId":"the-linked-shipment-id","status":"shipped"}
```

POST the exact JSON bytes to `/api/webhooks/courier` with `X-Drip-Signature: HMAC_SHA256(COURIER_WEBHOOK_SECRET, raw_body)` in hexadecimal. Accepted statuses are `shipped` and `delivered`. Only a packed, paid, linked order can move forward. Duplicate/out-of-order events never move delivery backwards. The timestamp shown is receipt time. Do not expose the bridge secret to a browser or accept an unsigned provider callback. A provider may report Delivered without a separate Shipped event; missing intermediate dates stay awaiting update rather than being invented.

Before real use: choose a courier that accepts the actual perfume shipments/routes, implement its own signature validation and status mapping, shipment booking, serviceability/rates, AWB handling and exception/RTO events, and test their sandbox. These cannot be completed against an account that does not exist.

## Costs and launch boundary

There is no added ecommerce subscription in this code. That does **not** mean a zero-cost business: payment processing, shipping, Meta messaging, domain and backend usage can incur charges. Check official pricing and plan terms before activating accounts. Workers assets and API/database requests have different billing; keep limits and spend controls appropriate to the store.

Live launch still requires approved catalogue/prices/stock, merchant capture settings, actual shipping/returns/privacy policies, verified fulfilment routes, authenticated production administration, backups/retention, reconciliation/refunds, abuse controls and real provider integration tests. Keeping this release sandbox-only prevents the current public demo catalogue from accepting real money.

Official integration references:

- [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [webhook validation](https://razorpay.com/docs/webhooks/validate-test/).
- [D1 transactions with batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [Worker asset routing](https://developers.cloudflare.com/workers/static-assets/binding/).
- [Meta Messages API](https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages).
- [Worker assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Razorpay pricing](https://razorpay.com/pricing/) and [WhatsApp pricing](https://business.whatsapp.com/products/platform-pricing).
