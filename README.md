# Drip & Dusk

A mobile-first fragrance storefront with a static frontend and a Cloudflare Worker checkout backend.

## Features

- A living hero photograph (scroll depth, pointer-led glow, drifting light) and sections that rise into view, all off for reduced-motion visitors; product discovery, filters and favourites.
- Full-bottle and decant variants, plus enquiry-only reference listings.
- A guided scent finder using verified top, heart and base notes processed by the backend.
- Direct UPI checkout with delivery totals and private tracking. Razorpay is retained for later activation and disabled in deployment configuration.
- Customer accounts with Google and email-code sign-in, plus guest checkout.
- An owner studio for the shared catalogue, store settings and order management, available only to approved owner accounts.
- Catalogue pagination, recently viewed fragrances and an owner-selected Hot sellers edit.
- A fixed WhatsApp community banner that shows a "coming soon" note until an invite link is added.

## Going live

`COMMERCE_MODE=live` is the production profile. It stores the customer's real delivery details, uses plain order references (`DD-XXXXXXXXXXXX`), and accepts real payments. Before switching:

1. Apply all SQL migrations, including `0008_launch_copy.sql`, which removes the old demonstration wording from stored products and settings.
2. Set `COMMERCE_MODE` to `live` in the private production Wrangler config.
3. Set `MERCHANT_UPI_ID` and `MERCHANT_PAYEE_NAME` for Direct UPI. Direct UPI stays unavailable until both are valid.
4. Razorpay stays off unless `RAZORPAY_ENABLED` is exactly `true` (any case, spaces ignored). Leave it `false`. Only if you re-enable it: store **live** `RAZORPAY_KEY_ID` (`rzp_live_…`), `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` as Wrangler secrets (test keys are rejected in live mode) and read "Re-enabling Razorpay" below. See `backend/RAZORPAY.md`.
5. Keep `TRACKING_SECRET` and owner sign-in (`AUTH_OWNER_IDS` with Supabase) configured. Checkout reports itself unavailable until owner access and at least one payment method are ready.
6. In Owner studio → Business & ordering, confirm the delivery charge, support email, returns address and policy text. Until delivery is saved, checkout uses the ₹99 flat rate (free above ₹3,000) shown in that form.
7. Check every listed price and stock count in Owner studio → Catalogue. Approved demo orders already deducted real stock, so recount the shelf and correct quantities before going live (see "Test orders and going live").
8. Set `PROXY_SIGNING_SECRET` in both the Worker and Vercel, deploy in the order under "Deployment order", and confirm Today shows "Visitor addresses: verified through the storefront".

The owner studio is opened at `/#admin`; it is no longer linked from the storefront.

## Owner studio tools

- **Today** is the studio's first screen: payments to verify, orders to pack and ship, unpaid UPI orders, payments needing review, open returns, low stock and today's sales. Each card opens the matching filtered list.
- **Bulk edit prices & stock** (Catalogue tab) edits price, reference price, stock and on-sale for many variants, then saves them together. If any row is invalid or was changed elsewhere, nothing is saved.
- **Order cards** have one-tap WhatsApp messages for the order's stage (payment reminder, verifying, confirmed, shipped, delivered) and a printable packing slip for paid orders.
- **Direct UPI holds**: an unpaid order holds stock for 30 minutes; once the customer submits a UPI reference, on live orders the hold extends to 4 hours so there is time to check the bank (test orders keep the 30-minute hold).

### Telegram order alerts

The owner gets a Telegram message for every new Direct UPI order, every submitted UPI reference and every Razorpay payment. Alerts contain the order reference, amount, items and UTR only, never the customer's name, phone or address.

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the bot token it gives you.
2. Open a chat with your new bot and send it any message.
3. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the `chat.id` number from the reply.
4. Store both as Worker secrets:

   ```sh
   npx wrangler@4.153.0 secret put TELEGRAM_BOT_TOKEN --config backend/wrangler.production.jsonc
   npx wrangler@4.153.0 secret put TELEGRAM_CHAT_ID --config backend/wrangler.production.jsonc
   ```
5. In Owner studio → Today, press **Send a test alert**.

### Photo storage

Uploaded product photos are stored in a Cloudflare R2 bucket (binding `MEDIA`) and served from `/media/…` with long-lived caching, instead of being embedded in the catalogue. Create the bucket once before deploying the Worker:

```sh
npx wrangler@4.153.0 r2 bucket create drip-and-dusk-media
```

The `MEDIA` binding requires the bucket: `wrangler deploy` fails if `drip-and-dusk-media` does not exist. Create the bucket first, or remove the `r2_buckets` entry from `backend/wrangler.production.jsonc` to deploy without photo storage. New photos are saved inline only while the binding is absent; existing inline photos keep working either way.

## Policy pages

`/privacy`, `/terms`, `/refunds`, `/shipping` and `/contact` are static pages generated from `scripts/policy-pages.mjs`; run `node scripts/policy-pages.mjs` after editing their wording. Business details are not written into the pages: `dist/policy.mjs` fills in the store name, legal name, support email and phone, address, Instagram link, grievance officer and delivery charges from Owner studio → Business & ordering, and hides any detail that is still blank. Razorpay reviews these pages before activating live payments, so complete those fields first.

## Run locally

```sh
COMMERCE_MODE=manual_demo node backend/dev-server.mjs
```

Open `http://127.0.0.1:4173`. The local server uses an in-memory database and test-only payment details. The frontend has no build step.

## Checks

```sh
node --test tests/*.test.mjs
```

The 125 automated checks cover catalogue logic, media controls, recommendations, checkout (test and live modes) and authentication. Provider responses are mocked; a real live payment must still be verified after the merchant accounts are connected.

## Backend

The optional backend is for sandbox development. It must be configured before enabling actual provider sign-in or payment testing. No real credentials or customer records belong in this repository. See the brief overviews in `backend/README.md` and `backend/AUTH.md`.

Media and product reference information is recorded in `asset-sources.json`. Confirm usage rights and commercial product information before using the site as a real store.

## Direct UPI workflow

The customer places an order, pays the exact total to the merchant UPI ID (the page offers an "Open UPI app" link on phones), and submits the UPI transaction reference (UTR). The order then waits for verification. In Owner studio → Orders, the owner checks the money actually arrived, enters the bank reference and amount, and approves. Approval records an audit entry and deducts reserved stock once. Unpaid holds expire after 30 minutes (4 hours on live orders once a UTR is submitted). A UTR alone never confirms an order; only the owner's approval does. Fulfilment advances through packed, shipped and delivered. The owner can copy a WhatsApp confirmation; no message is sent automatically.

The non-live `manual_demo` and `sandbox` profiles remain for testing. They label every order as a test, and `manual_demo` replaces personal details with a fixed sample address before saving.

Owner fragrance forms store structured notes. Deterministic note matching derives scent directions and occasion pairings, then the server finder applies availability, budget and format. It does not call an AI model. Unverified or incomplete pyramids stay out of recommendations. Hot sellers is an owner selection, not a claim about measured sales.

## Traffic preparation

Public catalogue reads share a five-second in-memory snapshot per Worker instance, including in-flight reads. Product, settings and stock changes invalidate the local snapshot; checkout always revalidates against current stock and prices. Browser rendering starts before optional account checks, and catalogue/configuration reads run in parallel. The scent finder ranks the backend-processed catalogue in the browser, avoiding an API request per shortlist.

A signed anonymous visitor cookie separates per-browser rate limits for customers behind the Vercel proxy. It grants no authentication or owner access. An additional shared-origin cap remains in place, and unverified cookies fall back to the client-address bucket (verified through the signed Vercel header when `PROXY_SIGNING_SECRET` is set, otherwise the shared proxy address). Supabase and Google retain their own provider limits; this does not promise 150 simultaneous completed sign-ins.

Run the bounded, read-only first-visit check with `node scripts/traffic-check.mjs https://drip-and-dusk-nine.vercel.app 200 400 h2`. It requests public pages/APIs and media only, and creates no orders, sign-ins or messages. Reports are written under `output/performance/`. This measures HTTP traffic from one generator, not browser rendering or an uptime guarantee.

Run `node scripts/image-variants.mjs` (needs `cwebp` from libwebp) to write the ~480px WebP copies in `dist/assets/sm/` and the `dist/image-variants.mjs` list that product cards use for `srcset`. Rerun it whenever catalogue photos are added, or replaced under the same filename, then commit the regenerated files.

The hero is a still photograph, so there is no background film to download. Profiles: omit the last argument for a standard first visit, or pass `critical` to match earlier reports. HTTP/2 mode uses four established TLS connections with multiplexed requests and requests compressed responses like a browser.

On 29 October 2026, 200 simulated first visits against the live site completed 5,200 requests with zero errors (95th-percentile time to first byte 203 ms, APIs 399 ms), measured before the video was removed and the faster loading changes were deployed. Earlier 150-visitor runs requested uncompressed responses and overstated transfer sizes about eightfold. This is a single-generator browsing result, not an uptime guarantee.

## Researched fragrance information

All 25 fragrances (32 bottle/decant entries) have complete top, heart and base notes, original descriptions, source links and a research date. See `research/catalogue-facts.json` for the catalogue audit and the two supporting research files for source discrepancies. Twenty-three pyramids use manufacturer publications; Hawas La Mer and Nautilus use corroborated retailer listings. Manufacturer and retailer bottle formats are reference information, separate from merchant stock. Assaf’s current 125 ml listings and retailers’ 150 ml listings are not treated as interchangeable inventory.

Families and occasions are editorial suggestions. Notes describe olfactory accords, not ingredient declarations. The finder includes tea, marine, leather and spicy/herbal directions. Unknown-price references appear separately as discovery suggestions only with no set budget and a full-bottle/either-format request. They cannot enter checkout or satisfy a price cap.

Migration `0004_fragrance_facts.sql` updates seed metadata while preserving prices, quantities, reservations, images and visibility. It skips owner-written pyramids. Browser catalogue revision 4 similarly upgrades the old seed notes without recreating deleted listings. Changing the saved pyramid removes research provenance if it no longer matches the sourced facts.

## Payment methods

Customers pay by Direct UPI. The Razorpay integration is kept for earlier payment records and for later re-enabling; each order stores its method. The backend verifies captured payments, exact amounts and callback signatures, and signed webhooks are idempotent. Customer surcharges are disabled. See `backend/RAZORPAY.md` for account setup.

## Owner operations

Owner studio → Business & ordering now controls the store display name, support email, business/returns address, Instagram link, homepage announcement and hero copy, animated versus still hero photograph, a flat India-wide checkout delivery charge, optional free-delivery threshold and low-stock threshold. Design, API secrets and owner permissions remain deployment settings. Custom video uploads and postcode-specific shipping zones are not provided by this form.

Orders supports search, stage/payment/method/return filters, India-time date ranges and 50-record pages. Recorded collections, delivery collected and externally recorded refunds cover all filtered records, including records beyond the current page. They are recorded payments, not profit or settlement reports. Order CSV exports apply the same filters (at most 10,000 records; narrow the dates above that); inventory CSV includes stock and reserved quantities. Low-stock indicators use stock remaining after reservations.

Paid orders support saved courier/AWB/HTTPS tracking links, visible through private customer tracking. Shipment fields do not book a courier or automate updates. Internal return/refund records require a reason; completed external refunds require an amount, reference and explicit confirmation. These records do not initiate a refund, change payment verification or automatically restock goods. Operation revisions reject conflicting edits, and shared mutations require owner authentication. Apply migration `0005_owner_operations.sql` before deploying the updated Worker.

## Direct UPI only

Razorpay is enabled only when `RAZORPAY_ENABLED`, trimmed and lower-cased, equals `true`. A missing, blank or malformed value disables it, so existing environments that never set the flag now run Direct UPI only; deploy the explicit `false` for clarity. While disabled, Razorpay does not appear in checkout options, `/api/config` or customer copy, new gateway orders are rejected, and an old unpaid Razorpay order cannot be resumed (its tracking page asks the customer to contact you). Payment verification (`/verify`) and the Razorpay webhook keep working for payments that already started. Live UPI still requires the merchant UPI details and live-mode prerequisites; this does not activate real payments.

### Re-enabling Razorpay

Set `RAZORPAY_ENABLED=true` and the keys, then widen the Content-Security-Policy in `backend/security-headers.mjs` (and the copies in `vercel.json` and `dist/_headers`; a test checks they match): add `https://checkout.razorpay.com` to `script-src`, `https://api.razorpay.com` to `frame-src`, and `https://lumberjack.razorpay.com` to `connect-src`. Also relax `payment=()` in `Permissions-Policy` so the payment sheet can open (for example `payment=(self "https://api.razorpay.com")`). Test it on a preview first.

## Deployment order

1. Apply migrations `0010_direct_upi_copy.sql` and `0011_order_safety.sql` (additive only; neither overwrites owner edits).
2. Set `PROXY_SIGNING_SECRET` (a random value of 32+ characters) as a Wrangler secret and as a Vercel environment variable with the same value, then deploy the Worker.
3. Deploy the frontend (push to `main`) with `middleware.js` and the updated `vercel.json`.
4. Open Today in the owner studio and confirm the line "Visitor addresses: verified through the storefront" (check it on the preview first, then on production).
5. Only then set `REQUIRE_SIGNED_PROXY=true` as a Worker var and redeploy, and with it on, place one real test order through the website on the preview or production before relying on it (the signature binds the HTTP method and path, so a mismatch only shows on a real order). If Today then shows the red "New orders are being refused" warning, turn the variable off or fix `PROXY_SIGNING_SECRET`. It is off by default and only a trimmed, case-insensitive `true` turns it on. While on, `POST /api/orders` and the UTR submission refuse requests without a verified signed client address (403, "Please place your order through the Drip & Dusk website."), so the open-order limits cannot be bypassed by calling the Worker directly; if `PROXY_SIGNING_SECRET` is missing or short they fail closed with 503 ("Checkout is not configured."). Other routes, webhooks and owner routes are unaffected. Turn it off before rolling back or removing the middleware, or customers cannot order.

### Rolling back

Rolling the Worker back to a version without `tracking_version` makes the old v1 links of orders that were reset or anonymised work again, and stops newly issued v2 links. Roll back only if no tracking reset or anonymisation has run; otherwise fix forward and reset those links again afterwards. Migration 0011 is additive, so the columns can stay in place.

Releasing the Worker before the frontend is safe; with no signed header the Worker keeps its previous shared per-proxy limits and does not apply the per-address cap of 5.

### Verify the visitor-IP signing (required on a Vercel preview)

`middleware.js` has not been run on Vercel from this repository. This project uses legacy `routes` and no framework, so check on a preview deployment before relying on it: set the same `PROXY_SIGNING_SECRET` on the preview and in the Worker the preview talks to, sign in as owner, open Today, and look for "verified through the storefront" (the API reports `clientIpSource: "signed-proxy"`). If it says "not verified", the middleware did not run or the secrets differ.

Fallback B if the middleware cannot run in this project: replace the `/api/*` proxy routes with a small Vercel function that reads the client IP from `x-real-ip`, signs `client-ip:v1:<ip>:<timestamp ms>:<METHOD>:<path>` with HMAC-SHA256 (hex) and fetches the Worker with the three headers `x-dd-client-ip`, `x-dd-client-ts` and `x-dd-client-sig` (the same scheme as `middleware.js`).

### Security headers

`backend/security-headers.mjs` is the single source for the CSP, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options` and `Permissions-Policy`. They are applied by the Worker (including policy routes), by a first catch-all route in `vercel.json`, and by `dist/_headers` for workers.dev static assets. Verify on a preview that the storefront, sign-in and checkout still work and the browser console shows no CSP violations. HSTS is left to Vercel's default.

## Open-order limits

An unpaid, unexpired order counts against its phone number (2), its browser (2) and, when the Vercel signature is verified, its network address (5; IPv6 by /64). Hashes are one-way (HMAC with `TRACKING_SECRET`), are checked atomically at order creation, and are cleared by the 5-minute cron once an order is no longer open. A customer over a limit sees "You already have unpaid orders. Finish or wait for those first."

## Late payments and payment review

If money reaches your bank after a hold expired, open the order in Orders and use **Record late payment** (bank reference, the amount you actually received, and the bank-check box). The order moves to payment review and stock is not touched. In payment review you can **Fulfil if stock allows** (only when free stock covers every line and, for Direct UPI, the amount received equals the order total) or record a refund. Refund records are internal notes; no refund is ever executed from the studio. A UTR submitted by a customer is only a claim and never confirms anything.

## Test orders and going live

Orders list, reports and CSV show only the current checkout mode unless "All modes (includes test orders)" is chosen. Actions on test orders from another mode are refused (a live deployment may still cancel leftover open test orders to release their holds). Nothing deletes test orders. To review them from the Cloudflare D1 console (dry run):

```sql
SELECT mode,status,COUNT(*) FROM orders WHERE mode!='live' GROUP BY mode,status;
```

To cancel open test holds (records an audit row, deletes nothing; run both statements in this order, by a human, after checking the dry run):

Replace `1790000000000` with the current time in milliseconds, using the same number in both statements. The audit row is written only for orders this update actually cancelled, so an order approved in between gets no false record.

```sql
UPDATE orders SET status='cancelled',updated_at=1790000000000 WHERE mode!='live' AND status IN('pending','awaiting_verification') AND payment_status='pending';
INSERT INTO owner_audit(id,order_id,action,actor,reference,at) SELECT lower(hex(randomblob(16))),id,'cancel','sql-cleanup','open test order',1790000000000 FROM orders WHERE mode!='live' AND status='cancelled' AND payment_status='pending' AND updated_at=1790000000000 AND id NOT IN(SELECT order_id FROM owner_audit WHERE action='cancel' AND at=1790000000000);
```

Approved demo orders already deducted real stock. Before going live, count the shelf and set every product's quantity in Owner studio → Catalogue.

## Data retention and deletion

Keep financial records (order reference, amounts, items, dates, payment and refund references, courier details) for as long as your accountant or the law requires. Use **Remove customer details** on an order card to delete the name, phone and address, detach the signed-in account, clear the return note (and the notes copied into the audit trail) and invalidate the tracking link. It is available for delivered orders, closed unpaid orders and orders with a recorded refund, and never for an open return. Use **Reset tracking link** if a customer's link was shared by mistake.

To unlink a signed-in customer's account (run in the D1 console, then delete the Supabase user in the Supabase dashboard):

```sql
DELETE FROM auth_sessions WHERE user_id='<supabase user id>';
DELETE FROM auth_flows WHERE email='<email>';
UPDATE orders SET customer_user_id=NULL WHERE customer_user_id='<supabase user id>';
```

Tracking links have no automatic expiry; they are revoked only by a reset or by removing customer details.
