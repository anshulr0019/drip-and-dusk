# Drip & Dusk — The Fragrance Edit

A fragrance storefront concept for Deepak Hotwani’s multi-brand fragrance retail business. The public demo is a lightweight static site with no framework runtime or build step. A separate optional Worker/D1 checkout server supports Razorpay sandbox integration; it is not activated on the public Vercel demo.

## Run locally

From this folder, run `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`, then open http://127.0.0.1:4173. Use an HTTP server; ES modules do not run reliably from file URLs.

Run all logic and media checks with `node --test tests/*.test.mjs`.

## Present the demo

1. Open the storefront. The charcoal hero, warm ivory catalogue, editorial serif headings and restrained olive/champagne details give the collection a coherent identity. A matching poster appears immediately while three supplied fragrance films play as a silent loop with soft crossfades. A pause control, system reduced-motion support and data-saver fallback are included.
2. Search for Khamrah, apply a budget or brand filter, and switch between full bottles and decants. Open a listing and select the exact variant. Original bottle images identify decants; they do not depict decant packaging.
3. Add quantities to the bag and choose **Try checkout preview**. Review the example address and sample delivery charge (₹99, included above ₹3,000), simulate a failed or successful payment, then open Owner studio → Demo orders to advance Confirmed → Packed → Shipped → Delivered. This is a simulation with no charge, message or shipment. Demo orders and stock changes persist only in this browser; tracking links work only here. You can also preview the existing WhatsApp enquiry message. The default number is blank, so the demo contacts nobody. Estimated totals exclude shipping and use displayed prices. An enquiry never reserves stock or confirms an order.
4. Open Owner studio from the banner or footer, or use `/#admin`. Tap a price for a quick edit, mark a variant sold out, or use Duplicate to add another size. Changes immediately appear in the same browser’s storefront. A new product requires an uploaded image.
5. Use Edit for descriptions, notes, images, conditions, quantities, deals, featured flags and ordering. Lower catalogue/featured order numbers appear first. Hide removes a listing from the storefront. Archive removes it with a restore option; permanent deletion is available inside Archive with confirmation.
6. Record sale reduces inventory, validates the quantity and marks zero stock sold out. Sales through WhatsApp, Instagram or any other channel must be recorded manually unless a future integration is added. Adding to a bag or opening WhatsApp never deducts stock.
7. Business & ordering edits the contact number, about copy, FAQs, shipping, payment/returns text and genuine review area. Keep missing information marked pending. Enter a country-code phone number only after the owner approves it. Saving a number enables an explicit, reviewed WhatsApp handoff; sending still happens inside WhatsApp.
8. Reset demo data restores sample products, settings, bag and favourites on this browser. Uploads and edits will be lost. This is a deliberate reset with confirmation.

## Two selected additions

- Exact product links encode the variant ID and open its detail view. This makes the sample catalogue easy to share through messages. Browser-created custom products exist only in the browser that created them; cross-device custom-product links need a backend.
- Favourites persist locally without an account and offer a Saved catalogue filter. This helps visitors maintain a shortlist without slowing down browsing.

A comparison view was considered and omitted: it needs more owner-verified specifications and adds friction to this lightweight demo.

## Data and security boundaries

There are 14 sample variants (seven fragrances, each as a bottle and 10 ml decant), using INR and India-style number formatting as an assumption. Prices, reference prices, discounts, stock quantities, offers, decant availability and conditions are entirely fabricated demo data, clearly labelled in the UI. They do not represent Deepak’s inventory. The About and ordering copy requires owner approval. No testimonials, ratings, sales counts, authorised-dealer status, guarantees or delivery commitments are fabricated.

The owner studio has no authentication. Local storage is persistence, not security. Anyone using this browser can edit the demo; another device has an independent dataset. A private Sites deployment restricts access to the demo as a whole but does not turn the local studio into a secure production admin. Browser storage can be cleared, filled or disabled. Storage failures show feedback rather than silently pretending to save.

The bag stores product IDs and requested quantities. Current prices and stock are revalidated from the shared model. Hidden, archived, deleted, sold-out or oversubscribed entries block an enquiry until adjusted or removed. Existing bags reflect price changes; the seller must still confirm final prices. The public static site includes a labelled checkout simulation; it does not collect money, send messages or create shipments. Example delivery details remain in memory and are not saved with browser-local demo orders. The optional server implementation below is separate from the public preview.

## Before production

- Add a shared database and durable image storage, with backups and a migration from sample data.
- Add real owner authentication and server-enforced read/write permissions. Validate stock and prices on the server; never trust browser totals as authoritative.
- Approve exact brands, variants, sizes, descriptions, notes, stock, conditions, prices and offers with Deepak. Confirm the WhatsApp business number and legal business contact details.
- Confirm licences/permission for product photos and replace or approve the illustrative hero. Source images are brand references for this private proposal.
- Supply actual shipping, payment, returns/cancellation, privacy and other required business policies. Publish customer reviews only when genuine and permissioned.
- Choose the intended public audience and domain. Test actual iOS/Android devices, keyboard and screen-reader navigation, accessibility contrast, performance and WhatsApp handoff on the production domain. The site is private by default.
- Keep manual sale recording, or build an explicit inventory integration for sales made elsewhere.

## Media and content sources

Product imagery and note lists are referenced from Lattafa’s brand pages and Rasasi’s store. Each detail view links to its brand source. See asset-sources.json. The Oud for Glory brand page has conflicting note lists; this demo deliberately marks its note pyramid pending verification.

The current hero uses the three user-supplied Gemini videos `d&d-v3.mp4` (Lava Gold), `d&d-v2.mp4` (Nautilus) and `d&d-v1.mp4` (Noir), in that order. `dist/assets/fragrance-loop.mp4` combines them into a 23.21-second, 1280 × 720 H.264 loop with 0.8-second crossfades, including the last-to-first transition. The visibly ghosted middle of the Noir input is trimmed, with a short dissolve between its clear portions. Every audio track is removed; the approximately 1.3 MB MP4 has fast-start metadata. `dist/assets/hero-poster.jpg` is its opening frame. Originals in Downloads are not modified.

Video downloads/playback are deferred when reduced motion or browser data-saving is enabled, unless the visitor explicitly presses Play. Playback pauses offscreen and in hidden tabs. Browser autoplay rejection leaves a Play control; media failures retain the poster. The whole bottle stays visible on desktop, with a right-focused crop on phones.

To regenerate the media, run `python3 scripts/prepare-hero-video.py /path/to/Downloads` with ffmpeg and ffprobe installed.

The earlier generated concept still remains at `dist/assets/hero.jpg` for reference; the current hero does not load it.

Final hero prompt: “Use case: product-mockup. Asset type: premium fragrance retailer website hero photograph, wide landscape 1536x1024. Primary request: cinematic still life of two unbranded perfume bottles on dark brown travertine and charcoal stone, one clear faceted square bottle of deep amber liquid with heavy glass cap, one smoked dark glass bottle with black cap, cropped close. Scene: moody warm brown studio, rich dusk shadows, subtle haze, reflections on dark surface. Composition: perfume bottles in the right half, left half clean almost black negative space for website text. Art direction: sophisticated editorial still life, tangible material, diagonal shaft of soft afternoon amber light, restrained and photorealistic, no gold ornament. No text, no labels, no logos, no watermark. Not a mockup of a website.”

## Implementation

- `dist/core.mjs`: shared sample model, filters, inventory validation, sale calculation, totals and message formatting.
- `dist/app.mjs`: storefront, detail routes, favourites, enquiry dialogs, owner studio, uploads and local persistence.
- `dist/hero-video.mjs`: background media lifecycle, pause/resume, reduced motion, data saving, offscreen/visibility handling and poster fallback.
- `dist/style.css`: responsive design, visible focus and reduced-motion styles.
- `scripts/prepare-hero-video.py`: repeatable local video preparation without modifying the originals.
- `tests/hero-video.test.mjs`: reduced motion, data saving, pause/resume, visibility, autoplay rejection and media-failure checks.
- `tests/core.test.mjs`: 12 checks for valid seeds, stock status, discounts, invalid values, sale limits, totals, unavailable bags, price/stock changes, search, combined filters, sorting and favourites.

No application credentials are shipped in the static output. No real customer data is used.


## October storefront refinement

The homepage now leads with one hero action and four live catalogue edits: After dark, Fresh daily, Warm & spiced and Under ₹3,000. Edits compose with search, format, budget and availability filters. All fragrances groups bottle/decant variants into one card per scent; explicit format and Saved views keep exact variants. Cards use restrained bottle presentation, editorial scent families and sample prices without promotional discount badges.

Fragrance details include bottle and label views of the same source image (not additional product photographs), full-bottle/decant choices, current stock, quantity, notes, editorial occasion pairings and a sticky enquiry action. Delivery, sourcing, decant preparation and returns can be reviewed before enquiry. Concentration remains “Confirm with seller” until the owner supplies a verified value. Genuine customer text is shown only after the default placeholder is replaced; no testimonials, delivery promises or sourcing guarantees are invented.

Owner Studio adds optional scent collection, family, concentration and occasion fields. Existing local edits and uploaded images are preserved. All admin limitations documented above still apply: authentication and shared storage were explicitly deferred by the owner in this update.

`tests/curation.test.mjs` checks grouping, collection composition, live price thresholds, custom metadata and preservation of exact decant matches. Product photos remain the existing brand references; a consistent original photography shoot is still a business task.


## Instagram catalogue expansion

The 18 identified perfumes from the supplied Instagram grid are now added as individual full-bottle reference listings, alongside the original seven demo scents. The default catalogue contains 25 fragrances / 32 listings including the original decants. The Instagram edit filter isolates the 18 additions, which appear first in curated order.

Names and images are sourced from the previously collected product references in `asset-sources.json`. Bottle size, selling price, inventory, condition, concentration and notes are not inferred from retailer images. These listings use enquiry-only mode with “Ask for price”, “Size to confirm” and “Availability to confirm”. Product-specific message previews ask the seller for the exact version and commercial details; they cannot be added to a priced basket or counted as available stock. Products identified only from boxes carry an explicit version-confirmation note.

The owner can keep enquiry-only mode while editing a listing, or uncheck it after entering a valid size, price and stock. The migration adds these 18 listings once to returning browsers, preserves existing local edits and images, and does not resurrect subsequent deletions. A genuine reset restores the expanded defaults.

`dist/instagram-products.mjs` contains the reference catalogue. The 18 photographs are resized to a maximum 900 px and encoded as JPEGs with a white transparency background; together they add approximately 0.8 MB. Original references remain untouched. `tests/instagram-catalogue.test.mjs` checks packaged assets, migration, price/availability filtering, product-specific enquiry text and the transition into stocked inventory.

## Find your scent

Open `/#finder` from the navigation, catalogue invitation or discreet floating button. The guided finder asks for occasion, scent preference and budget, with an explicit full-bottle/decant/either choice. It returns up to three distinct scents with note-based explanations, an editorial trade-off, the exact size and current sample price, product links and enquiry-bag actions. No account, external AI request, paid model API or answer persistence is involved. This is a deterministic guided finder, not a conversational AI service.

Coffee date is an occasion; Coffee notes is a separate preference. A fresh or floral recommendation requires a matching overall scent family as well as note evidence, so a citrus top note alone does not classify a rich amber scent as fresh. If no eligible product fits, the finder says so and lets the visitor revise answers or open the existing seller-contact preview. It never silently raises the budget or changes format.

Recommendations use current inventory, exclude hidden/archived/sold-out/enquiry-only products and re-evaluate displayed results after catalogue changes. Eligible note pyramids are the six originally verified fragrance profiles (excluding the conflicting Oud for Glory notes), or products explicitly marked “Include in scent finder — note pyramid verified” by the owner. Owner additions need an accurate scent family, a verified opening / heart / base note pyramid, confirmed size/price and available stock. The 18 Instagram entries remain browseable while awaiting those details; their inclusion is not fabricated.

`dist/scent-matching.mjs` contains eligibility, scoring, evidence and explanation rules. `dist/scent-finder.mjs` renders the three-step dialog and results. `tests/scent-matching.test.mjs` covers constraints, distinct scent grouping, coffee matching, fresh/floral classification, unavailable inventory, custom verified data, empty results and invalid input. Radio groups support keyboard arrows and Home/End; dialog focus and reduced-motion behavior follow the existing storefront conventions.


## Background video badge cleanup

The user-supplied films include a fixed Gemini sparkle beside the bottle base. The preparation script now interpolates only the background rectangle at x=1128, y=568, width=64, height=64 in the normalized 1280×720 output. It applies this after the cyclic transitions, then regenerates the matching opening poster. This avoids cropping into the bottles or changing their labels; a small softened patch remains in the background texture. The video and poster URLs use a new media version so returning browsers fetch the cleaned files. The website continues to label the films as AI-generated. Audio remains removed, and the source files in Downloads remain untouched.


## Checkout and order tracking

The static deployment intentionally uses `dist/commerce-config.mjs` with `mode: 'preview'`. It must never treat browser storage as a real order database. Adding to the bag does not deduct stock; simulated payment success saves the demo order and stock change together. Repeated completion of the same request does not deduct twice. Example addresses/phone numbers are not persisted. Failed payment, stale quotes, invalid quantities, missing commercial details and unavailable stock block confirmation. Tracking links require an unguessable token but are a local demonstration, not cross-device private production tracking. Reset demo data also removes these demo orders.

`backend/worker.mjs` and the D1 migration implement server-priced quotes, transactional stock reservations, idempotent orders, Razorpay test payment verification, authenticated order administration, token-protected tracking, a signed courier bridge and an optional direct WhatsApp confirmation outbox. The Worker serves `commerce-config.mjs` dynamically to activate the API on the same origin. Browser catalogue editing is disabled in connected mode, so it cannot pretend to update the server. No paid service has been purchased or activated, and no actual provider payment, courier or WhatsApp request has been tested with merchant credentials.

See [backend/README.md](backend/README.md) for local testing, sandbox deployment, account setup and the remaining launch work. **Live payments are deliberately disabled in this release.** There are 57 automated checks covering the storefront, media, finder, model and checkout API. The checkout screens and browser-local fulfilment flow have also been checked in desktop and mobile browser views.
