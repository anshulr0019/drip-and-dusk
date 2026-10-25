# Drip & Dusk — The Fragrance Edit

A complete private concept for Deepak Hotwani’s multi-brand fragrance retail business. Built as a lightweight static site: no framework runtime, dependency installation or build step.

## Run locally

From this folder, run `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`, then open http://127.0.0.1:4173. Use an HTTP server; ES modules do not run reliably from file URLs.

Run logic checks with `node --test tests/core.test.mjs`.

## Present the demo

1. Open the storefront. The charcoal hero, warm ivory catalogue, editorial serif headings and restrained olive/champagne details give the collection a coherent identity. The static hero appears immediately, with gentle optional motion, a pause control and system reduced-motion support. No unrelated stock video is used.
2. Search for Khamrah, apply a budget or brand filter, and switch between full bottles and decants. Open a listing and select the exact variant. Original bottle images identify decants; they do not depict decant packaging.
3. Add quantities to the enquiry bag and preview the WhatsApp message. The default number is blank, so the demo contacts nobody. Estimated totals exclude shipping and use displayed prices. An enquiry never reserves stock or confirms an order.
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

The bag stores product IDs and requested quantities. Current prices and stock are revalidated from the shared model. Hidden, archived, deleted, sold-out or oversubscribed entries block an enquiry until adjusted or removed. Existing bags reflect price changes; the seller must still confirm final prices. No checkout, payments, reservation, backend order creation or customer information is collected.

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

The hero was generated with the built-in image-generation tool and saved at `dist/assets/hero.jpg`. It is illustrative, not a photograph of a product for sale.

Final hero prompt: “Use case: product-mockup. Asset type: premium fragrance retailer website hero photograph, wide landscape 1536x1024. Primary request: cinematic still life of two unbranded perfume bottles on dark brown travertine and charcoal stone, one clear faceted square bottle of deep amber liquid with heavy glass cap, one smoked dark glass bottle with black cap, cropped close. Scene: moody warm brown studio, rich dusk shadows, subtle haze, reflections on dark surface. Composition: perfume bottles in the right half, left half clean almost black negative space for website text. Art direction: sophisticated editorial still life, tangible material, diagonal shaft of soft afternoon amber light, restrained and photorealistic, no gold ornament. No text, no labels, no logos, no watermark. Not a mockup of a website.”

## Implementation

- `dist/core.mjs`: shared sample model, filters, inventory validation, sale calculation, totals and message formatting.
- `dist/app.mjs`: storefront, detail routes, favourites, enquiry dialogs, owner studio, uploads and local persistence.
- `dist/style.css`: responsive design, visible focus and reduced-motion styles.
- `tests/core.test.mjs`: 12 checks for valid seeds, stock status, discounts, invalid values, sale limits, totals, unavailable bags, price/stock changes, search, combined filters, sorting and favourites.

No application credentials are shipped in the static output. No real customer data is used.
