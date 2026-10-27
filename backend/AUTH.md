# Account feature overview

The storefront includes Google and email-code sign-in screens and optional customer accounts. Guest checkout remains available.

Real sign-in requires the store operator to connect the identity service and deploy the configured backend. The static account preview does not create a user or authenticate anyone. The explicitly labelled local owner demo is a presentation feature and provides no production security.

Provider availability is configured separately: Google requires `AUTH_GOOGLE_ENABLED=true` after provider setup; email can be paused with `AUTH_EMAIL_ENABLED=false`. Disabled providers cannot start a sign-in flow.

In the configured backend, customer accounts are separate from approved owner access, and customers see only their own account orders. Guest tracking links continue to work independently. Favourites currently remain on the device where they were saved.

The store operator should keep identity-provider setup, owner approvals and operational configuration in private deployment documentation. No real account credentials or customer data should be committed here. Automated tests use mocked identity responses; the real provider setup still needs browser verification.
