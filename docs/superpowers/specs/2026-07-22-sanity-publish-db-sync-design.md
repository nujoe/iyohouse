# Sanity Publish DB Sync Design

## Goal

Allow Studio users to publish a workshop once and have the existing Supabase workshop runtime record update automatically, without changing registration, payment, capacity, or public UI behavior.

## User Flow

1. A Studio user edits a workshop draft.
2. The user presses Sanity's normal `Publish` action.
3. A Sanity document webhook fires only for published `workshop` create and update events.
4. The application verifies the webhook signature and invokes the existing workshop sync service.
5. The service creates or updates the matching Supabase `workshops` row and writes the generated UUID back to Sanity for new workshops.

The current Studio `DB 정보 업데이트` action is removed from the normal document actions. A separate super-admin-only retry endpoint remains available for operational recovery, but is not exposed to regular Studio users.

## Data Boundary

The automatic sync uses the existing mapping only:

- `title`
- `price`
- `student_price`
- `capacity`
- `schedule_capacities`
- `status` from `isActive` and `isClosed`

It does not write or alter registrations, payments, refunds, selected schedules, capacity counts, or the public workshop detail UI. Existing confirmed and pending registrations remain untouched.

## Architecture

Extract the current protected sync loop from `/api/admin/sync-workshops` into a server-only service. The existing administrator route and the new webhook route call that same service, preventing two data-mapping implementations from drifting apart.

The new route accepts only signed Sanity document-webhook requests. It verifies the raw request body through `x-sanity-signature` and `SANITY_WEBHOOK_SECRET`, requires the configured Sanity project and dataset headers, ignores delete events, and forwards the published workshop document ID to the shared sync service. The webhook uses Sanity's `idempotency-key` as a request key for logs; repeated delivery is safe because Supabase updates are idempotent by workshop UUID.

## Failure Handling

- Invalid or missing signature: return 401 and make no database calls.
- Wrong project, dataset, document type, or delete event: return 204 and make no database calls.
- Invalid price, student price, or capacity: return 422, preserving the prior Supabase record.
- Supabase or Sanity write failure: return 500 so Sanity retries; no registration or payment record is changed.
- A failed delivery is visible in Sanity's webhook attempt log. The retained server-side retry route can be used after correcting the document.

## Rollout

1. Deploy the endpoint with `SANITY_WEBHOOK_SECRET` configured in Vercel.
2. Create a Sanity document webhook in Project Settings > API > Webhooks:
   - URL: `https://www.iyohouse.com/api/webhooks/sanity/workshop-publish`
   - Method: `POST`
   - Trigger: create and update
   - Filter: `_type == "workshop"`
   - Include drafts: disabled
   - Secret: the same value as `SANITY_WEBHOOK_SECRET`
3. Publish a test workshop with a safe price/capacity change and verify only its Supabase `workshops` row changes.
4. Remove the Studio `DB 정보 업데이트` action after the webhook is confirmed.

## Security and Operational Constraints

- The shared webhook secret is server-side only and never stored in a Studio document or browser bundle.
- The endpoint uses a raw body for signature verification and never trusts an unverified document ID.
- The existing website super-admin session check continues to protect manual administrator sync/retry operations.
- The implementation adds no database migration and does not change NICEPAY, checkout, confirmation, webhook, schedule capacity, or applicant UI code.
