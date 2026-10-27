# Optional sandbox backend

This folder contains the optional checkout backend for the Drip & Dusk demo. It is separate from the static public preview and is not activated by publishing the frontend.

It supports sandbox order handling, payment verification, customer accounts and owner authorization. Merchant-owned services and operator configuration are required before external integrations can be tested. Live payments remain disabled in this release.

For local development with example data:

```sh
node backend/dev-server.mjs
```

Run checks from the repository root with:

```sh
node --test tests/*.test.mjs
```

Tests use local data and mocked provider responses. Do not enter real customer data in the demo. Deployment instructions and operational configuration should be maintained privately by the store operator; never commit real credentials or account records.
