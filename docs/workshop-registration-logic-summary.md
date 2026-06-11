# Workshop Registration Logic Summary

Last checked: 2026-06-10

This document summarizes the current implementation state for auth, workshop registration, payment confirmation, and image-performance changes. The binding contract remains `docs/workshop-registration-contract.md`; this file is an implementation map and handoff note.

## Current Status

- The backend integration structure is consolidated under `src/lib/supabase/*`.
- Workshop registration uses the DB UUID stored as `supabase_workshop_id`.
- Browser code does not create registration rows directly.
- Payment confirmation is handled by the server route and the service-role RPC.
- Missing Supabase environment variables now fail explicitly instead of silently using fallback clients.
- Build and lint pass when required environment variables are supplied.

## Supabase Client Structure

| Purpose | File | Used By |
| --- | --- | --- |
| Browser session/client | `src/lib/supabase/browser.ts` | `useAuth`, onboarding, client-side RPC calls |
| Server SSR session/client | `src/lib/supabase/server.ts` | auth callback, payment routes |
| Service-role/admin client | `src/lib/supabase/admin.ts` | workshop data APIs |
| Middleware session refresh | `src/lib/supabase/middleware.ts` | `src/middleware.ts` |

Required environment variables:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
IYO_NICEPAY_ENABLED
IYO_NICEPAY_MODE
IYO_NICEPAY_CLIENT_KEY
IYO_NICEPAY_SECRET_KEY
```

## Auth Flow

1. User starts OAuth login through Google or Kakao.
2. OAuth redirects to `/auth/callback`.
3. `src/app/auth/callback/route.ts` exchanges the code for a Supabase cookie session.
4. The route checks the user profile.
5. If `full_name` or `phone` is missing, the user is redirected to `/onboarding`.
6. `useAuth` exposes:
   - `user`
   - `session`
   - `profile`
   - `isLoading`
   - `isProfileComplete`
   - `signInWithGoogle`
   - `signInWithKakao`
   - `signOut`
   - `updateProfile`
   - `supabase`

## Workshop Data Flow

1. `useWorkshopData` calls `/api/workshops/data`.
2. `/api/workshops/data` fetches:
   - Sanity workshops and events
   - confirmed registration counts from Supabase
3. Sanity workshop documents must include `supabase_workshop_id` for paid registration.
4. Hardcoded legacy workshop cards are displayed with `supabase_workshop_id: null`.
5. A legacy card without a DB UUID cannot start paid registration.

Important distinction:

- Display routing may still use the Sanity id or numeric legacy id for URL selection.
- Registration RPC calls must only use `supabase_workshop_id`.

## Registration Start Flow

The registration start logic lives in `src/app/page.tsx`.

1. User clicks the workshop registration button.
2. Client checks:
   - user is logged in
   - profile is complete
   - selected workshop has `supabase_workshop_id`
   - workshop is not closed in the UI
   - required schedule is selected
3. The client creates a pending registration first, then asks the server for a NICEPAY checkout payload.
4. Client calls:

```ts
supabase.rpc('create_pending_registration', {
  p_workshop_id: workshop.supabase_workshop_id,
})
```

5. The RPC returns:
   - `registration_id`
   - `order_id`
   - `amount`
6. The client posts `registration_id` to `/api/payment/checkout`.
7. The server verifies ownership, pending state, expiry, order id, and amount.
8. The client opens NICEPAY with the server-generated payload.

## DB RPC Responsibilities

`create_pending_registration(p_workshop_id UUID)` handles:

- authenticated user check
- profile existence check
- `full_name` and `phone` validation
- duplicate active registration prevention
- workshop row lock
- capacity check against pending and confirmed registrations
- pending registration creation
- snapshot fields:
  - `snapshot_name`
  - `snapshot_phone`
  - `snapshot_email`
- generated `order_id`
- returned payment bootstrap values

`confirm_payment_registration(p_registration_id UUID, p_payment_key TEXT, p_order_id TEXT, p_amount INTEGER)` handles:

- registration existence check
- order id validation
- amount validation
- idempotency check for already confirmed registrations
- pending-only transition to confirmed
- payment record creation

Permissions:

- `create_pending_registration(UUID)` is granted to `authenticated`.
- `confirm_payment_registration(UUID, TEXT, TEXT, INTEGER)` is granted only to `service_role`.
- pending expiry is service-role only.

## Payment Success Flow

1. NICEPAY posts its server authentication result to `/api/payment/confirm`.
2. The server route:
   - finds the pending registration by NICEPAY `orderId`
   - verifies `authResultCode`
   - verifies `authToken + clientId + amount + IYO_NICEPAY_SECRET_KEY`
   - calls the NICEPAY approval API
   - verifies approval `orderId`, `amount`, and optional result signature
   - calls `confirm_payment_registration` through the service-role client
3. After server confirmation, the route redirects to `/payment/success`.
4. The success page only displays the confirmed result. It does not call the confirmation API.

## Payment Failure Flow

1. NICEPAY client-side errors stay in the payment window flow, or the server redirects to `/payment/fail` with `registration_id`.
2. The fail page posts failure details to `/api/payment/fail`.
3. The server route:
   - verifies the Supabase session
   - verifies registration ownership
   - only updates pending registrations
   - marks the registration as cancelled through the service-role client

## Image Optimization Changes

The frontend layout was preserved while improving image loading.

- `src/app/page.tsx` now uses `next/image` for:
  - detail poster
  - main logo
- The main logo has `priority`.
- `src/lib/legacyPosters.ts` stores actual image dimensions for legacy posters.
- Legacy posters reserve their real aspect ratio before image load.
- Large optimized WebP copies were added:

```txt
public/assets/18.webp
public/assets/24.webp
public/1.Ai.zip ①그래픽 (1월).Ai/poster.webp
```

## Validation Commands

Lint:

```bash
npm run lint
```

Build with required env present:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon_dummy \
SUPABASE_SERVICE_ROLE_KEY=service_dummy \
IYO_NICEPAY_ENABLED=false \
IYO_NICEPAY_MODE=test \
IYO_NICEPAY_CLIENT_KEY=S1_dummy \
IYO_NICEPAY_SECRET_KEY=secret_dummy \
npm run build
```

Contract scan:

```bash
rg -n "supabaseAdmin|workshop_registrations[^_]|payment_status|'completed'|test_sk_|placeholder\\.supabase" src supabase docs \
  --glob '!**/docs/workshop-registration-contract.md' \
  --glob '!**/docs/workshop-registration-logic-summary.md' \
  --glob '!**/.env.example' \
  --glob '!**/node_modules/**'
```

## Final Check Result

- Lint: pass, with non-blocking image warnings in `IyocaView` and `LoginModal`.
- Build: pass when required env variables are supplied.
- Contract scan: pass for application and migration code.
- Remaining operational requirement: create a real `.env.local` or deployment environment configuration before local runtime or production deployment.
