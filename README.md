# Drip & Dusk

A mobile-first fragrance storefront demo with a lightweight static frontend and an optional sandbox checkout backend.

## Preview features

- Fragrance films, product discovery, filters and favourites.
- Full-bottle and decant variants, plus enquiry-only reference listings.
- A guided scent finder using verified catalogue information.
- A labelled checkout simulation with delivery totals and order tracking.
- Customer account screens for Google and email-code sign-in, with guest checkout retained.
- A separate owner entry screen and an explicitly labelled local demo studio.

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

The 72 automated checks cover catalogue logic, media controls, recommendations, checkout and authentication behavior. Provider responses are mocked in tests; real account configuration requires separate verification by the store operator.

## Backend

The optional backend is for sandbox development. It must be configured before enabling actual provider sign-in or payment testing. No real credentials or customer records belong in this repository. See the brief overviews in `backend/README.md` and `backend/AUTH.md`.

Media and product reference information is recorded in `asset-sources.json`. Confirm usage rights and commercial product information before using the site as a real store.
