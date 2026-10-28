# Razorpay test checkout alongside manual UPI

The storefront has two payment choices. In the hosted `manual_demo` profile, Direct UPI uses the existing sample merchant and owner approval. Razorpay is shown as **Setup pending** until a merchant's test credentials are connected. There is no customer surcharge. Live keys are rejected.

No Razorpay merchant account is configured yet. Unit/API tests use mocked provider responses; a real Razorpay test payment and webhook delivery remain to be verified after account setup.

## Connect the merchant's account

1. Create or sign in to the merchant's own Razorpay account and switch its dashboard to **Test mode**. Follow the current [API-key instructions](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys).
2. Generate the test Key ID and Key Secret. Keep both in the backend deployment's secret storage. Do not paste the secret into chat, commit it, or place it in frontend files. Only the test Key ID is returned to the authorized checkout session.
3. In the Razorpay test dashboard, enable automatic payment capture. An `authorized` payment alone never confirms a website order. See [payment capture settings](https://razorpay.com/docs/payments/payments/capture-settings).
4. Configure this public test webhook endpoint:

   `https://drip-and-dusk-nine.vercel.app/api/webhooks/razorpay`

   Subscribe to `payment.captured` and `order.paid`. Use a separate random webhook secret of at least 32 characters; store the same value as `RAZORPAY_WEBHOOK_SECRET` on the backend. This is different from the API Key Secret. See [webhook signature validation](https://razorpay.com/docs/webhooks/validate-test/).
5. Store these three values using interactive Wrangler secret prompts with the existing private production configuration:

   ```sh
   npm exec --yes --package=wrangler@4.153.0 -- wrangler secret put RAZORPAY_KEY_ID --config backend/wrangler.production.jsonc
   npm exec --yes --package=wrangler@4.153.0 -- wrangler secret put RAZORPAY_KEY_SECRET --config backend/wrangler.production.jsonc
   npm exec --yes --package=wrangler@4.153.0 -- wrangler secret put RAZORPAY_WEBHOOK_SECRET --config backend/wrangler.production.jsonc
   ```

   Paste values only into their hidden terminal prompts. Keep `COMMERCE_MODE=manual_demo` to retain both payment choices and sample personal-data handling. No database migration is needed for this change.
6. Reload checkout. Confirm that Razorpay is labelled **Test mode**, make a provider test payment, and verify the signed webhook reaches the endpoint. Check the pending, failed, dismissed, successful and expired-payment paths before considering a live release.

## Order flow

- The quote and total are calculated on the server. Both methods have zero added customer payment fee; a client-supplied fee or total is ignored.
- Creating an order records its selected method. Manual UPI holds stock for 30 minutes; Razorpay test orders hold it for 15 minutes.
- Razorpay orders are created server-side and use the standard hosted checkout script from `https://checkout.razorpay.com/v1/checkout.js`. The native storefront dialog closes before opening that payment window.
- The callback signature is checked against the server's stored gateway order ID. The backend fetches the payment and requires a matching order, INR currency, exact amount and `captured` status.
- Signed webhooks can confirm the payment even if the browser callback is missed. Repeated callbacks/webhooks deduct inventory once.
- A closed payment window does not mark the order paid or failed. The private tracking page allows retrying the same gateway order. Refreshing or retrying cannot silently switch its method or create another gateway order.
- If a captured payment arrives after the stock hold expired, the order is marked **Payment needs review** without consuming stock that may already have been released.
- Manual UPI references cannot confirm a Razorpay order, and Razorpay callbacks cannot confirm a manual UPI order. Verified gateway orders support the same owner-operated packing, shipping and delivery flow.
- WhatsApp automation remains disabled. Confirmation messages can be previewed/copied for manual sharing.

## Live release remains separate

This release cannot accept real Razorpay payments or collect real UPI payments. Merchant activation, approved prices/stock/delivery rules, owner assignment, policies and refund handling must be completed for a live release. Do not enable a convenience fee without checking the account's approval and applicable payment-method rules. Current Razorpay integration guidance: [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).
