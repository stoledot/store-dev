# Conference product (Cloudflare / D1)

This extension issues one access key per purchased seat when the customer receipt
is delivered, and shows the same credentials on the private order page. It uses
Minshop's existing paid-order and email outbox flows; it does not create a second
checkout or payment path.

## Configure before publishing the product

Set these non-secret Worker variables in `wrangler.jsonc` under `vars` (or in the
Cloudflare Worker dashboard under Settings → Variables and Secrets):

- `CONFERENCE_ZOOM_URL`: required HTTPS Zoom meeting URL, e.g.
  `https://zoom.us/j/123456789`. Use the actual meeting link for your event.
- `CONFERENCE_INSTRUCTIONS`: optional plain-text instructions shown in the email
  and order page. If omitted, the product description is used; otherwise a short
  generic instruction is shown.

Example (replace the URL and instructions before deploying):

```jsonc
"vars": {
  "CONFERENCE_ZOOM_URL": "https://zoom.us/j/123456789",
  "CONFERENCE_INSTRUCTIONS": "Fecha: 15 de noviembre, 18:00 (hora de Ciudad de México). Entra cinco minutos antes."
}
```

These are not secrets, but only put a real meeting URL in production. Do not put
meeting passwords or private host credentials in the public product description.
The generated access key is an order credential, not a Zoom-generated passcode;
if Zoom requires a meeting passcode, include it in `CONFERENCE_INSTRUCTIONS` only
if that is appropriate for every purchaser.

## Create the product

Create a normal Minshop product named **Conferencia** with slug `conferencia`.
Set it to active and configure price/stock as usual. The feature recognizes a
product only when its slug or its trimmed name is exactly `conferencia` (case
insensitive). For multiple distinct events, this first version deliberately uses
one shared Zoom URL/instructions configuration; do not create multiple products
named Conferencia unless they should share the same event details.

## Deploy

1. Back up D1 and deploy the code.
2. Apply the additive migration to the same database bound as `DB`:
   `npm run db:migrate:remote`
3. Set the two Worker variables above and deploy the Worker using the normal
   Minshop deployment procedure (`npm run deploy`).
4. Make a low-value test purchase with a real reachable email and confirm the
   key appears on `/order/<private-access-token>` and in the receipt.
5. Test duplicate webhook delivery: it must not create additional keys for the
   same purchased seats. Test a full refund before making the product available.

If a conference is purchased while `CONFERENCE_ZOOM_URL` is missing/invalid,
the customer-receipt outbox item is marked failed and is eligible for Minshop's
normal retry/sweep after configuration is fixed. The paid order is not rolled
back. The customer order page also attempts to create/retrieve the access.

## Behavior and limits

- One unique key is generated per quantity purchased; retries reuse the same
  `(order_item_id, seat_number)` row.
- Access is stored separately from `order_items` in `conference_access`, so the
  core order schema stays unchanged.
- The key is displayed only on the token-protected order page and delivered by
  the existing customer receipt email.
- A fully refunded order does not expose conference access on the order page or
  status endpoint. This version does not automatically revoke a Zoom attendee;
  Zoom registration/API integration would be a separate feature.
