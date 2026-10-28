# Drip & Dusk

A mobile-first fragrance storefront demo with a lightweight static frontend and an optional sandbox checkout backend.

## Preview features

- Fragrance films, product discovery, filters and favourites.
- Full-bottle and decant variants, plus enquiry-only reference listings.
- A guided scent finder using verified top, heart and base notes processed by the backend.
- A sample merchant UPI checkout plus a prepared Razorpay test option, with delivery totals, private tracking and no added customer payment fee.
- Customer account screens for Google and email-code sign-in, with guest checkout retained.
- Authenticated shared catalogue, community settings and order management; a separate browser-local studio in the standalone preview.
- Catalogue pagination, recently viewed fragrances and a labelled owner-selected Hot sellers edit.
- A fixed WhatsApp community banner with a safe preview until an approved invite is configured.

The catalogue uses sample prices and stock. Checkout does not collect money, send messages or create shipments. Real account sign-in requires the configured backend and enabled identity provider. The standalone static preview keeps real sign-in disabled. An account preview is not a real login. Browser-local demo edits are not production administration.

## Run locally

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4173`. No build step is needed for the static frontend.

## Checks

```sh
node --test tests/*.test.mjs
```

The 106 automated checks cover catalogue logic, media controls, recommendations, checkout and authentication behavior. Provider responses are mocked in tests; real account configuration requires separate verification by the store operator.

## Backend

The optional backend is for sandbox development. It must be configured before enabling actual provider sign-in or payment testing. No real credentials or customer records belong in this repository. See the brief overviews in `backend/README.md` and `backend/AUTH.md`.

Media and product reference information is recorded in `asset-sources.json`. Confirm usage rights and commercial product information before using the site as a real store.

## Sample UPI workflow

Run `COMMERCE_MODE=manual_demo node backend/dev-server.mjs` for the shared local demo. Use the local development owner key printed in the dev-server source only for local testing. On the hosted demo, `?demo=1#admin` opens the isolated browser-local sample studio. It grants no server permissions. Production owner access requires an explicitly approved Supabase user ID in the server configuration; customer sign-in does not grant owner access.

The sample identity `dripanddusk@example` is not a payment destination. No payment intent or scannable payment QR is generated. Reference submission leaves the order awaiting verification. Owner approval checks an entered reference and amount, records an audit entry and deducts reserved stock once. Unpaid holds expire after 30 minutes. Manual fulfilment advances through packed, shipped and delivered. The owner can preview and copy a WhatsApp confirmation; no automatic message is sent.

Apply all SQL migrations before deploying the updated Worker. Keep account-specific deployment files and secrets ignored. `manual_demo` uses sample delivery charges and replaces entered personal details with a fixed sample address before persisting the order. Live UPI collection still needs a real merchant identity, approved prices, delivery rules, policies and an explicit release change.

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

The payment selector preserves Direct UPI as the sample default and displays Razorpay as Setup pending until test API keys and a separate webhook secret are configured. In the hosted manual-demo profile, both methods can coexist; each order stores its chosen method. The backend verifies captured payments, exact amounts and callback signatures. Signed webhooks are idempotent, and the private order page can resume the existing Razorpay gateway order after dismissal. Test keys only; customer surcharges and live payments are disabled. See `backend/RAZORPAY.md` for the merchant-account setup and test verification still required.

## Owner operations

Owner studio → Business & ordering now controls the store display name, support email, business/returns address, Instagram link, homepage announcement and hero copy, existing film versus still image, a flat India-wide checkout delivery charge, optional free-delivery threshold and low-stock threshold. Design, API secrets and owner permissions remain deployment settings. Custom video uploads and postcode-specific shipping zones are not provided by this form.

Orders supports search, stage/payment/method/return filters, India-time date ranges and 50-record pages. Recorded collections, delivery collected and externally recorded refunds cover all filtered records, including records beyond the current page. They are demonstration/test figures, not profit or settlement reports. Order CSV exports apply the same filters (at most 10,000 records; narrow the dates above that); inventory CSV includes stock and reserved quantities. Low-stock indicators use stock remaining after reservations.

Paid orders support saved courier/AWB/HTTPS tracking links, visible through private customer tracking. Shipment fields do not book a courier or automate updates. Internal return/refund records require a reason; completed external refunds require an amount, reference and explicit confirmation. These records do not initiate a refund, change payment verification or automatically restock goods. Operation revisions reject conflicting edits, and shared mutations require owner authentication. Apply migration `0005_owner_operations.sql` before deploying the updated Worker.
