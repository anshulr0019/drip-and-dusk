# Drip & Dusk

A mobile-first fragrance storefront with a static frontend and a Cloudflare Worker checkout backend.

## Features

- Fragrance films, product discovery, filters and favourites.
- Full-bottle and decant variants, plus enquiry-only reference listings.
- A guided scent finder using verified top, heart and base notes processed by the backend.
- Two payment methods, Direct UPI and Razorpay, with delivery totals, private order tracking and no added payment fee.
- Customer accounts with Google and email-code sign-in, plus guest checkout.
- An owner studio for the shared catalogue, store settings and order management, available only to approved owner accounts.
- Catalogue pagination, recently viewed fragrances and an owner-selected Hot sellers edit.
- A fixed WhatsApp community banner that shows a "coming soon" note until an invite link is added.

## Going live

`COMMERCE_MODE=live` is the production profile. It stores the customer's real delivery details, uses plain order references (`DD-XXXXXXXXXXXX`), and accepts real payments. Before switching:

1. Apply all SQL migrations, including `0008_launch_copy.sql`, which removes the old demonstration wording from stored products and settings.
2. Set `COMMERCE_MODE` to `live` in the private production Wrangler config.
3. Set `MERCHANT_UPI_ID` and `MERCHANT_PAYEE_NAME` for Direct UPI. Direct UPI stays unavailable until both are valid.
4. For Razorpay, store **live** `RAZORPAY_KEY_ID` (`rzp_live_…`), `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` as Wrangler secrets. Test keys are rejected in live mode. See `backend/RAZORPAY.md`.
5. Keep `TRACKING_SECRET` and owner sign-in (`AUTH_OWNER_IDS` with Supabase) configured. Checkout reports itself unavailable until owner access and at least one payment method are ready.
6. In Owner studio → Business & ordering, confirm the delivery charge, support email, returns address and policy text. Until delivery is saved, checkout uses the ₹99 flat rate (free above ₹3,000) shown in that form.
7. Check every listed price and stock count in Owner studio → Catalogue.

The owner studio is opened at `/#admin`; it is no longer linked from the storefront.

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

The customer places an order, pays the exact total to the merchant UPI ID (the page offers an "Open UPI app" link on phones), and submits the UPI transaction reference (UTR). The order then waits for verification. In Owner studio → Orders, the owner checks the money actually arrived, enters the bank reference and amount, and approves. Approval records an audit entry and deducts reserved stock once. Unpaid holds expire after 30 minutes. Fulfilment advances through packed, shipped and delivered. The owner can copy a WhatsApp confirmation; no message is sent automatically.

The non-live `manual_demo` and `sandbox` profiles remain for testing. They label every order as a test, and `manual_demo` replaces personal details with a fixed sample address before saving.

Owner fragrance forms store structured notes. Deterministic note matching derives scent directions and occasion pairings, then the server finder applies availability, budget and format. It does not call an AI model. Unverified or incomplete pyramids stay out of recommendations. Hot sellers is an owner selection, not a claim about measured sales.

## Traffic preparation

Public catalogue reads share a five-second in-memory snapshot per Worker instance, including in-flight reads. Product, settings and stock changes invalidate the local snapshot; checkout always revalidates against current stock and prices. Browser rendering starts before optional account checks, and catalogue/configuration reads run in parallel. The scent finder ranks the backend-processed catalogue in the browser, avoiding an API request per shortlist.

A signed anonymous visitor cookie separates per-browser rate limits for customers behind the Vercel proxy. It grants no authentication or owner access. An additional shared-origin cap remains in place, and unverified cookies fall back to the backend IP bucket. Supabase and Google retain their own provider limits; this does not promise 150 simultaneous completed sign-ins.

Run the bounded, read-only first-visit check with `node scripts/traffic-check.mjs https://drip-and-dusk-nine.vercel.app 150 300 h2 critical`. It requests public pages/APIs and media only, and creates no orders, sign-ins or messages. Reports are written under `output/performance/`. This measures HTTP traffic from one generator, not browser rendering or an uptime guarantee.

The `critical` profile measures the shopping page without waiting for a full background-video download. Omit `critical` to include the film. HTTP/2 mode uses four established TLS connections with multiplexed requests; it does not simulate 150 separate TLS handshakes. Slow mobile connections and stalled playback retain the poster image.

On 28 October 2026, the critical-page HTTP/2 check completed 3,900 requests from 150 simulated guests with zero errors, including 600 public API requests. The 95th-percentile time to first byte was 559 ms overall. This is a single-generator browsing result with the optional full-film transfer excluded; earlier full-media and connection tests recorded timeouts, so it is not a blanket reliability or video-playback guarantee. Local reports retain those limitations.

## Researched fragrance information

All 25 fragrances (32 bottle/decant entries) have complete top, heart and base notes, original descriptions, source links and a research date. See `research/catalogue-facts.json` for the catalogue audit and the two supporting research files for source discrepancies. Twenty-three pyramids use manufacturer publications; Hawas La Mer and Nautilus use corroborated retailer listings. Manufacturer and retailer bottle formats are reference information, separate from merchant stock. Assaf’s current 125 ml listings and retailers’ 150 ml listings are not treated as interchangeable inventory.

Families and occasions are editorial suggestions. Notes describe olfactory accords, not ingredient declarations. The finder includes tea, marine, leather and spicy/herbal directions. Unknown-price references appear separately as discovery suggestions only with no set budget and a full-bottle/either-format request. They cannot enter checkout or satisfy a price cap.

Migration `0004_fragrance_facts.sql` updates seed metadata while preserving prices, quantities, reservations, images and visibility. It skips owner-written pyramids. Browser catalogue revision 4 similarly upgrades the old seed notes without recreating deleted listings. Changing the saved pyramid removes research provenance if it no longer matches the sourced facts.

## Two payment choices

Direct UPI and Razorpay can both be offered; each order stores its chosen method. The backend verifies captured payments, exact amounts and callback signatures. Signed webhooks are idempotent, and the private order page can resume the existing Razorpay order after the window is dismissed. Customer surcharges are disabled. See `backend/RAZORPAY.md` for account setup.

## Owner operations

Owner studio → Business & ordering now controls the store display name, support email, business/returns address, Instagram link, homepage announcement and hero copy, existing film versus still image, a flat India-wide checkout delivery charge, optional free-delivery threshold and low-stock threshold. Design, API secrets and owner permissions remain deployment settings. Custom video uploads and postcode-specific shipping zones are not provided by this form.

Orders supports search, stage/payment/method/return filters, India-time date ranges and 50-record pages. Recorded collections, delivery collected and externally recorded refunds cover all filtered records, including records beyond the current page. They are recorded payments, not profit or settlement reports. Order CSV exports apply the same filters (at most 10,000 records; narrow the dates above that); inventory CSV includes stock and reserved quantities. Low-stock indicators use stock remaining after reservations.

Paid orders support saved courier/AWB/HTTPS tracking links, visible through private customer tracking. Shipment fields do not book a courier or automate updates. Internal return/refund records require a reason; completed external refunds require an amount, reference and explicit confirmation. These records do not initiate a refund, change payment verification or automatically restock goods. Operation revisions reject conflicting edits, and shared mutations require owner authentication. Apply migration `0005_owner_operations.sql` before deploying the updated Worker.
