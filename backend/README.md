# Checkout backend

This folder contains the Cloudflare Worker that serves checkout, order tracking, customer accounts and the owner studio API for Drip & Dusk.

`COMMERCE_MODE=live` accepts real payments once the merchant UPI ID and/or live Razorpay keys are configured (see the root README). The `sandbox` and `manual_demo` profiles are for testing only.

For local development with test data:

```sh
COMMERCE_MODE=manual_demo node backend/dev-server.mjs
```

Run checks from the repository root with:

```sh
node --test tests/*.test.mjs
```

Tests use local data and mocked provider responses. Do not enter real customer data in local or test profiles. Deployment instructions and operational configuration should be maintained privately by the store operator; never commit real credentials or account records.
