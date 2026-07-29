# Admin Payment Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each confirmed workshop applicant's recorded NICEPAY payment amount and payment method in the superadmin detail table, for payments completed after the DB migration.

**Architecture:** NICEPAY approval remains the payment source of truth. A new five-argument confirmation RPC stores a normalized, non-sensitive method in the existing `payments.payment_method` column while retaining the deployed four-argument RPC. The administrator reads payment rows by `registration_id`; the client renders server-provided data only.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres RPC, NICEPAY server approval API, CSS tables, node:test static checks.

## Global Constraints

- Do not change checkout UI, NICEPAY request payloads, payment success/failure redirects, capacity, registration status transitions, or Sanity CMS behavior.
- Do not query NICEPAY from the administrator page and do not store card numbers, approval numbers, issuer names, receipts, or raw NICEPAY payloads.
- Preserve confirmed-only email recipients, cancelled applicant display, student highlighting, and schedule-change controls.
- Existing payment rows with no stored method render as `기록 없음`.
- Apply the production Supabase migration before deploying app code that calls the five-argument RPC.
- Keep the four-argument `confirm_payment_registration` RPC available during rollout.

---

### Task 1: Persist a normalized payment method

**Files:**
- Create: `supabase/migrations/20260729000000_add_payment_method_to_confirmation.sql`
- Modify: `src/lib/payment/nicepay.ts`
- Modify: `src/app/api/payment/confirm/route.ts`
- Modify: `src/app/api/payment/webhook/route.ts`
- Modify: `scripts/test-nicepay-payment-static.mjs`
- Create: `scripts/test-admin-payment-details-static.mjs`

- [ ] Write a failing static check for a normalized method helper, both RPC callers passing `p_payment_method`, and a service-role-only five-argument RPC.
- [ ] Run `node --test scripts/test-admin-payment-details-static.mjs` and confirm it fails.
- [ ] Add a five-argument RPC overload. Insert the method on first confirmation and fill it only when an existing matching payment has no method; do not change amount, order ID, TID, or registration status behavior.
- [ ] Normalize only `CARD`, `BANK`, `VBANK`, `CELLPHONE`, `KAKAOPAY`, `PAYCO`, `SAMSUNGPAY`, and `NAVERPAY` source values to Korean display labels.
- [ ] Run `node --test scripts/test-admin-payment-details-static.mjs && npm run test:payment`.
- [ ] Commit the task.

### Task 2: Render payment details in the administrator table

**Files:**
- Modify: `src/lib/admin/workshopAdmin.ts`
- Modify: `src/components/admin/AdminWorkshopApplicantsClient.tsx`
- Modify: `src/styles/13-admin.css`
- Modify: `scripts/test-admin-payment-details-static.mjs`

- [ ] Extend the failing static check to require a server-only successful-payment lookup by confirmed registration IDs and client payment amount/method cells.
- [ ] Run `node --test scripts/test-admin-payment-details-static.mjs` and confirm it fails.
- [ ] Attach `payment_amount` and `payment_method` to confirmed applicant rows only. Add the two columns after name, retain the existing horizontal-scroll wrapper, and raise the explicit table minimum width so the schedule selector remains usable.
- [ ] Keep cancelled/refund columns, email selections, and schedule-change controls unchanged.
- [ ] Run `node --test scripts/test-admin-payment-details-static.mjs scripts/test-admin-schedule-change-static.mjs scripts/test-admin-cancelled-and-tutors-static.mjs`.
- [ ] Commit the task.

### Task 3: Document and verify deployment order

**Files:**
- Modify: `docs/nicepay-payment-integration.md`
- Modify: `docs/workshop-registration-contract.md`

- [ ] Document the new RPC signature, normalized method-only storage, historical `기록 없음` behavior, and migration-before-code deployment order.
- [ ] Run `npm run test:payment && npm run test:workshop-schedule-capacity && node --test scripts/test-admin-payment-details-static.mjs scripts/test-admin-schedule-change-static.mjs scripts/test-admin-cancelled-and-tutors-static.mjs && npm run build`.
- [ ] Commit the task.
