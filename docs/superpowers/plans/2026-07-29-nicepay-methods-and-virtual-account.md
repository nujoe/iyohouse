# NICEPAY 간편결제 및 가상계좌 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NICEPAY card/easy-payment selection and virtual-account issuance without changing workshop capacity, existing card payment behaviour, Sanity publishing, or workshop layout.

**Architecture:** The workshop page opens a small NICEPAY-styled method modal. Card/easy payments use `cardAndEasyPay` and follow the existing confirmation RPC. Virtual accounts use `vbank`, receive a pending payment ledger entry after NICEPAY returns `ready`, and become confirmed only through a signed NICEPAY `paid` webhook. A server environment flag prevents virtual-account issuance until the production webhook is registered and verified.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase PostgreSQL/RPC/RLS, NICEPAY V1 Server Approval JS SDK, Node static tests.

## Global Constraints

- Preserve the current card payment request, approval, cancellation, workshop capacity, Sanity publication, and workshop-detail layout flows.
- Use `AUTHNICE.requestPay()` only; the external checkout UI remains NICEPAY-provided.
- The local method modal and every IYOHOUSE payment screen use NICEPAY-style white surfaces, thin neutral borders, black text, and simple buttons. Do not reuse the IYOHOUSE login-modal frame.
- The method modal has only a top-right close button plus `카드·간편결제` and `가상계좌` large buttons.
- `cardAndEasyPay` is the only card/easy request method. NICEPAY chooses the final card, KakaoPay, NaverPay, or SamsungPay method and that final response value is persisted.
- `vbank` has a three-hour deadline: `IYO_NICEPAY_VBANK_VALID_HOURS=3`.
- Never enable virtual-account checkout in production before NICEPAY has the deployed HTTPS webhook URL registered and the callback returns `200 OK`. `IYO_NICEPAY_VBANK_ENABLED=0` is the safe initial setting.
- All payment mutations remain server-only through the service-role Supabase client or service-role-only SQL RPCs. Client requests must be owner-checked.
- Do not add Sanity fields, modify CMS publish/sync code, or change unrelated page layout CSS.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/payment/nicepay.ts` | NICEPAY request-method allowlist, virtual-account payload extraction, provider status normalization, and safe configuration helpers. |
| `src/app/api/payment/methods/route.ts` | Public, non-secret booleans that let the page enable card/easy and virtual-account buttons safely. |
| `src/app/api/payment/checkout/route.ts` | Owner-checked checkout payload creation and virtual-account seat-reservation extension. |
| `src/app/api/payment/confirm/route.ts` | Signed NICEPAY approval handling; routes `vbank/ready` to the issuance RPC and other paid methods to the existing confirmation RPC. |
| `src/app/api/payment/webhook/route.ts` | Signed provider notification handling with TID-scoped virtual-account completion/failure transitions. |
| `src/app/api/payment/pending/route.ts` | Owner-scoped virtual-account status and display data for the pending screen. |
| `supabase/migrations/20260729000001_add_virtual_account_payment_lifecycle.sql` | Payment-ledger fields and service-role-only reservation, issuance, completion, and failure RPCs. |
| `src/components/workshop/NicepayPaymentMethodModal.tsx` | The two-button, closeable method dialog. |
| `src/components/workshop/WorkshopDetailOverlay.tsx` | Opens the dialog after existing login/profile/schedule/capacity checks; creates a pending registration only after a method is chosen. |
| `src/app/payment/pending/page.tsx` | Owner-only virtual-account deposit information and final status screen. |
| `src/app/payment/success/page.tsx` and `src/app/payment/fail/page.tsx` | NICEPAY-style completion and error surfaces. |
| `src/styles/14-payment.css` | Isolated payment-only styling; imported by `src/app/globals.css`. |
| `src/lib/admin/workshopAdmin.ts`, `src/components/admin/AdminWorkshopApplicantsClient.tsx`, `src/styles/13-admin.css` | Read and render a separate virtual-account pending list without changing confirmed applicant controls. |
| `scripts/test-nicepay-virtual-account-static.mjs` | Regression assertions for the new request, state, route, migration, and UI contracts. |
| `.env.example`, `docs/nicepay-payment-integration.md` | Configuration, rollout, and production webhook instructions. |

## Task 1: Define NICEPAY request methods and safety configuration

**Files:**
- Create: `scripts/test-nicepay-virtual-account-static.mjs`
- Modify: `src/lib/payment/nicepay.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `NicepayCheckoutMethod = "cardAndEasyPay" | "vbank"`.
- Produces `getNicepayAvailableCheckoutMethods(): { cardAndEasyPay: boolean; vbank: boolean }`.
- Produces `getNicepayVirtualAccount(payload): { code: string; name: string; number: string; holder: string; expiresAt: string } | null`.
- Consumed by checkout, confirm, webhook, and method modal tasks.

- [ ] **Step 1: Write the failing static contract test**

Create `scripts/test-nicepay-virtual-account-static.mjs` with Node test assertions that inspect `src/lib/payment/nicepay.ts` for all exact contracts below:

```js
assert.match(nicepay, /cardAndEasyPay/, "must support the NICEPAY card/easy request method");
assert.match(nicepay, /IYO_NICEPAY_VBANK_ENABLED/, "must gate vbank until webhook rollout");
assert.match(nicepay, /IYO_NICEPAY_VBANK_VALID_HOURS/, "must configure vbank expiry in hours");
assert.match(nicepay, /getNicepayAvailableCheckoutMethods/, "must expose non-secret method availability");
assert.match(nicepay, /getNicepayVirtualAccount/, "must extract issued virtual account data");
```

Add an npm script:

```json
"test:nicepay-vbank": "node --test scripts/test-nicepay-virtual-account-static.mjs"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:nicepay-vbank`

Expected: FAIL because `cardAndEasyPay` is currently normalized into `card`, no virtual-account activation flag exists, and no extraction helper exists.

- [ ] **Step 3: Implement the minimal NICEPAY method contract**

In `src/lib/payment/nicepay.ts`:

```ts
export type NicepayCheckoutMethod = "cardAndEasyPay" | "vbank";

export function getNicepayAvailableCheckoutMethods() {
  const config = getNicepayConfig();
  return {
    cardAndEasyPay: config.methods.includes("cardAndEasyPay"),
    vbank: config.vbankEnabled && config.methods.includes("vbank"),
  };
}
```

Make `cardAndEasyPay` a request method rather than converting it to `card`. Preserve `card` as a legacy configured method so the current production configuration remains valid until its environment variables are changed. Validate an explicit requested method against the configured list and return an error to the caller; never silently replace an unsupported user-supplied method with the default card method.

Add `vbankEnabled` from `IYO_NICEPAY_VBANK_ENABLED` with a default of `false`. Keep `vbankValidHours` finite, positive, and defaulted to `3` only when the variable is absent or invalid. Extract virtual-account data only from the nested NICEPAY `vbank` object and require all five values: code, name, number, holder, and ISO-8601 expiry.

- [ ] **Step 4: Extend the static test for the invalid-method behaviour**

Add assertions that checkout payload construction has an explicit allowed-method path and does not retain the prior fallback branch that substitutes `config.method` after rejecting the provided method.

- [ ] **Step 5: Run the focused test**

Run: `npm run test:nicepay-vbank`

Expected: PASS.

- [ ] **Step 6: Commit the isolated contract change**

```bash
git add src/lib/payment/nicepay.ts scripts/test-nicepay-virtual-account-static.mjs package.json
git commit -m "Add NICEPAY checkout method configuration"
```

## Task 2: Add an atomic virtual-account payment lifecycle to Supabase

**Files:**
- Create: `supabase/migrations/20260729000001_add_virtual_account_payment_lifecycle.sql`
- Modify: `scripts/test-nicepay-virtual-account-static.mjs`

**Interfaces:**
- Produces service-role-only RPCs:
  - `reserve_virtual_account_registration(UUID, UUID, TIMESTAMPTZ)`
  - `record_virtual_account_issuance(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)`
  - `confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER)`
  - `fail_virtual_account_payment(UUID, TEXT, TEXT, TEXT)`
- Consumed by checkout, confirm, and webhook routes.

- [ ] **Step 1: Add failing migration assertions**

Extend `scripts/test-nicepay-virtual-account-static.mjs` to require the migration file and these exact protections:

```js
assert.match(sql, /ADD COLUMN IF NOT EXISTS provider_status TEXT/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS vbank_number TEXT/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reserve_virtual_account_registration/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_virtual_account_issuance/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.confirm_virtual_account_deposit/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fail_virtual_account_payment/);
assert.match(sql, /FOR UPDATE/, "payment lifecycle functions must lock their registration");
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.confirm_virtual_account_deposit[\s\S]+TO service_role/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:nicepay-vbank`

Expected: FAIL because the virtual-account migration is absent.

- [ ] **Step 3: Create the additive migration**

Add nullable ledger fields without changing historical card payments:

```sql
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vbank_code TEXT,
  ADD COLUMN IF NOT EXISTS vbank_name TEXT,
  ADD COLUMN IF NOT EXISTS vbank_number TEXT,
  ADD COLUMN IF NOT EXISTS vbank_holder TEXT;
```

Implement the four RPCs with `SECURITY DEFINER`, `SET search_path = public`, an initial `SELECT ... FOR UPDATE` on the registration, exact order/amount/TID comparisons, and explicit state checks:

- `reserve_virtual_account_registration` accepts only the authenticated owner ID supplied by the server, a currently unexpired `pending` registration, and an expiry timestamp later than `NOW()`; it updates only `expires_at`.
- `record_virtual_account_issuance` accepts `pending` registration status only, validates order and amount, persists `payment_method = '가상계좌'`, `status = 'pending'`, `provider_status = 'ready'`, the account fields, and the provider expiry. A repeated request with the same TID, order, amount, and registration returns true without changing data; a reused TID for another row raises an exception.
- `confirm_virtual_account_deposit` requires the pending ledger row to have the same TID/order/amount and `provider_status = 'ready'`; it changes that row to `status = 'success', provider_status = 'paid', paid_at = NOW()` and the registration to `confirmed` in the same transaction. Repeated paid webhooks return true only for the same confirmed payment.
- `fail_virtual_account_payment` requires the same pending ledger TID and an allowed provider status of `failed`, `expired`, or `cancelled`; it updates the ledger and changes only a still-pending registration to `cancelled`.

Revoke each new overload from `PUBLIC` and `authenticated`, then grant only `service_role`. Add an index on `(registration_id, status, provider_status)` for the pending-admin lookup.

- [ ] **Step 4: Run the focused test**

Run: `npm run test:nicepay-vbank`

Expected: PASS.

- [ ] **Step 5: Commit the migration**

```bash
git add supabase/migrations/20260729000001_add_virtual_account_payment_lifecycle.sql scripts/test-nicepay-virtual-account-static.mjs
git commit -m "Add virtual account payment lifecycle"
```

## Task 3: Route checkout, confirmation, and webhook events by payment lifecycle

**Files:**
- Create: `src/app/api/payment/methods/route.ts`
- Create: `src/app/api/payment/pending/route.ts`
- Modify: `src/app/api/payment/checkout/route.ts`
- Modify: `src/app/api/payment/confirm/route.ts`
- Modify: `src/app/api/payment/webhook/route.ts`
- Modify: `scripts/test-nicepay-virtual-account-static.mjs`
- Modify: `scripts/test-nicepay-payment-static.mjs`
- Modify: `scripts/test-nicepay-webhook-registration-static.mjs`

**Interfaces:**
- `GET /api/payment/methods` returns `{ cardAndEasyPay: boolean, vbank: boolean }` without client/secret keys.
- `GET /api/payment/pending?order_id=<orderId>` returns only the signed-in owner’s `{ status, amount, workshopTitle, vbankName, vbankNumber, vbankHolder, expiresAt }`.
- `POST /api/payment/checkout` accepts `method: "cardAndEasyPay" | "vbank"`.
- `POST /api/payment/confirm` redirects virtual-account issuance to `/payment/pending`; paid card/easy results keep redirecting to `/payment/success`.

- [ ] **Step 1: Add failing route assertions**

Extend `scripts/test-nicepay-virtual-account-static.mjs` with checks for the exact route interactions:

```js
assert.match(checkout, /reserve_virtual_account_registration/);
assert.match(confirm, /record_virtual_account_issuance/);
assert.match(confirm, /payment\/pending/);
assert.match(webhook, /confirm_virtual_account_deposit/);
assert.match(webhook, /fail_virtual_account_payment/);
assert.match(methods, /getNicepayAvailableCheckoutMethods/);
assert.match(pending, /user_id/);
```

Update existing static payment tests so they continue requiring card confirmation, signature validation, and `/api/payment/fail` cleanup.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:nicepay-vbank && npm run test:payment && node --test scripts/test-nicepay-webhook-registration-static.mjs`

Expected: The new virtual-account assertions fail; existing card and webhook-probe checks still pass.

- [ ] **Step 3: Implement the method and owner-status endpoints**

`GET /api/payment/methods` uses the server-only configuration helper and returns booleans only. It must not return a client key, secret, enabled merchant ID, mode, or environment variable values.

`GET /api/payment/pending` first obtains the session user, then uses the server admin client to load the registration by both `order_id` and `user_id`. It fetches only that registration’s virtual-account payment row and returns the account number only to the owner. If the registration is confirmed, return `status: "confirmed"` without exposing data for another registration. Return `401`, `403`, or `404` for unauthenticated, foreign, or missing orders.

- [ ] **Step 4: Implement checkout reservation and explicit method rejection**

In `POST /api/payment/checkout`, parse the method as an exact union. Reject an absent, unknown, disabled, or configuration-disabled method with a JSON `400` or `503`; do not fall back to card. Keep the existing session-user, registration-owner, registration-status, amount, and original expiry checks.

For `vbank`, call the service-role `reserve_virtual_account_registration` RPC with the current user ID and `new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString()` before returning the NICEPAY payload. If it returns false or errors, return an error and do not open NICEPAY. For `cardAndEasyPay`, keep the existing pending duration and no additional reservation extension.

- [ ] **Step 5: Implement confirmation branching**

Keep the existing auth signature, order ID, amount, and approval-result signature checks. Branch only after `approveNicepayPaymentAuth` returns a verified result:

```ts
if (getNicepayPaymentMethod(approval.payload) === "가상계좌" && approval.providerStatus === "ready") {
  // Extract nested vbank fields, record the issued ledger, redirect to /payment/pending.
} else if (approval.providerStatus === "paid") {
  // Existing confirm_payment_registration card/easy flow.
} else {
  // Compensate with NICEPAY cancellation when possible and redirect to failure.
}
```

For the virtual-account branch, reject absent account fields, call `record_virtual_account_issuance`, and redirect with `order_id`, workshop ID, and title. Do not call `confirm_payment_registration`, do not mark the registration cancelled, and do not invoke the card-compensation path after a successful issuance record.

- [ ] **Step 6: Narrow webhook state transitions without breaking card events**

Preserve the empty-body and `{}` NICEPAY registration probe response exactly as `200 OK`.

For every real webhook, retain signature, order, amount, and registration lookups. Load any matching payment ledger row by both `payment_key = tid` and `order_id`. Use the virtual-account RPCs only when the ledger is a `payment_method = '가상계좌'` row:

```ts
if (isVirtualAccount && resultCode === "0000" && status === "paid") {
  await supabase.rpc("confirm_virtual_account_deposit", { ... });
}
if (isVirtualAccount && ["expired", "failed", "cancelled"].includes(status)) {
  await supabase.rpc("fail_virtual_account_payment", { ... });
}
```

For existing card/easy `paid` events with no ledger row, retain `confirm_payment_registration`. For a card/easy cancellation, require a matching original `payments.payment_key` before cancelling the registration; do not cancel an arbitrary confirmed registration based on order ID alone. Ignore duplicate and out-of-order events with a `200 OK` response after logging only the safe payload.

- [ ] **Step 7: Run the payment regression tests**

Run:

```bash
npm run test:nicepay-vbank
npm run test:payment
node --test scripts/test-nicepay-webhook-registration-static.mjs
node --test scripts/test-admin-payment-details-static.mjs
```

Expected: PASS. Existing webhook registration probes remain `200 OK`; card confirmation assertions remain present.

- [ ] **Step 8: Commit the server lifecycle routes**

```bash
git add src/app/api/payment src/lib/payment/nicepay.ts scripts/test-nicepay-virtual-account-static.mjs scripts/test-nicepay-payment-static.mjs scripts/test-nicepay-webhook-registration-static.mjs
git commit -m "Handle NICEPAY virtual account lifecycle"
```

## Task 4: Add the NICEPAY-styled checkout choice and payment status screens

**Files:**
- Create: `src/components/workshop/NicepayPaymentMethodModal.tsx`
- Create: `src/app/payment/pending/page.tsx`
- Create: `src/styles/14-payment.css`
- Modify: `src/components/workshop/WorkshopDetailOverlay.tsx`
- Modify: `src/app/payment/success/page.tsx`
- Modify: `src/app/payment/fail/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `scripts/test-nicepay-virtual-account-static.mjs`

**Interfaces:**
- `NicepayPaymentMethodModal` receives `{ open, cardAndEasyPayEnabled, vbankEnabled, busy, onClose, onSelect }`.
- `onSelect(method: "cardAndEasyPay" | "vbank")` begins the current pending-registration and NICEPAY SDK sequence only after selection.
- `/payment/pending` reads the owner-only pending-status endpoint.

- [ ] **Step 1: Add failing markup and style-boundary assertions**

Add checks to `scripts/test-nicepay-virtual-account-static.mjs`:

```js
assert.match(overlay, /NicepayPaymentMethodModal/);
assert.match(modal, /aria-label="결제수단 선택 닫기"/);
assert.match(modal, /카드·간편결제/);
assert.match(modal, /가상계좌/);
assert.match(overlay, /method,?\s*:\s*selectedMethod/);
assert.equal(existsSync(join(root, "src/app/payment/pending/page.tsx")), true);
assert.match(globals, /14-payment\.css/);
assert.doesNotMatch(success, /login-modal-card/);
assert.doesNotMatch(fail, /style=\{\{/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:nicepay-vbank`

Expected: FAIL because the modal, pending page, payment stylesheet, and refactored status pages do not exist.

- [ ] **Step 3: Build the selection flow without changing existing workshop controls**

In `WorkshopDetailOverlay.tsx`, preserve the existing login, profile, workshop closure, schedule-selected, schedule-capacity, and student-price checks. After those checks, fetch `GET /api/payment/methods` and open the modal. Do not create a registration until `onSelect` runs.

Move the existing registration creation and SDK launch into `startWorkshopPayment(selectedMethod)`. Pass that method unchanged to checkout. Keep `fnError` cancellation for a checkout that fails before the user reaches the server confirmation route. Close the modal before opening the NICEPAY SDK. Disable both buttons while a request is in progress.

`NicepayPaymentMethodModal` renders only a close button and two large buttons. The virtual-account button stays disabled when the server reports `vbank: false`; it must not initiate `create_pending_registration` in that state.

- [ ] **Step 4: Implement isolated NICEPAY payment styles**

Create `src/styles/14-payment.css` with only new payment class names. Use a white full-page shell, `1px solid #d9d9d9` card borders, black text, 8px-or-less radius, and monochrome button hover/focus states. Include responsive width and safe mobile viewport padding. Import it after `13-admin.css` in `src/app/globals.css`.

Use these classes for the selection modal, success, fail, and pending pages. Do not modify `.login-modal-*`, workshop grid, sidebar, header, or auth styles.

- [ ] **Step 5: Implement the status pages**

Refactor `/payment/success` and `/payment/fail` to use the new payment classes. Preserve success’s workshop-return target. Failure continues to display a safe, user-facing message and returns to the workshop page when a workshop parameter is available; it does not call any payment mutation.

Create `/payment/pending` as a client status page that calls `/api/payment/pending?order_id=...`. Render these states:

```tsx
if (status === "confirmed") return <PaymentNotice title="입금이 확인되었습니다." />;
if (status === "pending") return <VirtualAccountDetails bank={vbankName} account={vbankNumber} holder={vbankHolder} amount={amount} expiresAt={expiresAt} />;
return <PaymentNotice title="가상계좌 입금 기한이 종료되었습니다." />;
```

Show the full account number only on this owner-checked page. Include a normal `워크숍 신청 페이지로 돌아가기` action; no login-modal visual elements remain.

- [ ] **Step 6: Run UI and regression tests**

Run:

```bash
npm run test:nicepay-vbank
npm run test:payment
npm run test:workshop-schedule-capacity
npm run lint
```

Expected: PASS with no new lint errors. Existing image warnings may remain only if they existed before this branch.

- [ ] **Step 7: Commit the payment UI**

```bash
git add src/components/workshop/NicepayPaymentMethodModal.tsx src/components/workshop/WorkshopDetailOverlay.tsx src/app/payment src/styles/14-payment.css src/app/globals.css scripts/test-nicepay-virtual-account-static.mjs
git commit -m "Add NICEPAY styled payment method flow"
```

## Task 5: Show virtual-account deposit waits separately in the admin

**Files:**
- Modify: `src/lib/admin/workshopAdmin.ts`
- Modify: `src/components/admin/AdminWorkshopApplicantsClient.tsx`
- Modify: `src/styles/13-admin.css`
- Modify: `scripts/test-nicepay-virtual-account-static.mjs`
- Modify: `scripts/test-admin-payment-details-static.mjs`

**Interfaces:**
- Produces `AdminPendingVirtualAccountRow` with `id`, `snapshot_name`, `snapshot_email`, `amount`, `vbank_name`, `masked_vbank_number`, and `expires_at`.
- Adds `pendingVirtualAccounts` to `AdminWorkshopApplicantsData` and `AdminWorkshopApplicantsClientProps`.
- Does not change `groups`, email-recipient selection, schedule controls, or the confirmed-payment query.

- [ ] **Step 1: Add failing admin assertions**

Add static assertions that the admin server query filters `payments` by `payment_method = "가상계좌"`, `status = "pending"`, and `provider_status = "ready"`, and that the client contains a separate `가상계좌 입금 대기` section. Keep the existing assertions requiring confirmed rows to query only `payments.status = "success"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:nicepay-vbank && node --test scripts/test-admin-payment-details-static.mjs`

Expected: The virtual-account assertions fail; the existing confirmed payment-detail assertions pass.

- [ ] **Step 3: Implement the server-side pending-account projection**

In `getAdminWorkshopApplicants`, query pending registrations for the selected workshop, then query only their payment rows where:

```ts
.eq("payment_method", "가상계좌")
.eq("status", "pending")
.eq("provider_status", "ready")
```

Join them in memory by `registration_id`, discard rows whose registration `expires_at` is already past, and mask account numbers as `****${number.slice(-4)}`. Keep the current confirmed-payment query unchanged and keep cancelled rows separate.

- [ ] **Step 4: Render the independent admin section**

Create one reusable `renderPendingVirtualAccountSection` in `AdminWorkshopApplicantsClient.tsx`, rendered both when confirmed groups exist and when they do not. Its read-only table has exactly: 이름, 이메일, 결제금액, 은행, 계좌번호, 입금기한. Do not add checkboxes, bulk email recipients, schedule selectors, or cancellation controls to it.

Add only narrowly-scoped `.admin-virtual-account-*` rules to `src/styles/13-admin.css`, retaining the existing responsive table wrapper and no new fixed width outside that section.

- [ ] **Step 5: Run admin and payment tests**

Run:

```bash
npm run test:nicepay-vbank
node --test scripts/test-admin-payment-details-static.mjs
node --test scripts/test-admin-schedule-change-static.mjs
node --test scripts/test-admin-cancelled-and-tutors-static.mjs
```

Expected: PASS. Confirmed applicant tables, email selection, schedule migration controls, cancelled display, and student-name colouring remain present.

- [ ] **Step 6: Commit the admin projection**

```bash
git add src/lib/admin/workshopAdmin.ts src/components/admin/AdminWorkshopApplicantsClient.tsx src/styles/13-admin.css scripts/test-nicepay-virtual-account-static.mjs scripts/test-admin-payment-details-static.mjs
git commit -m "Show pending virtual accounts in admin"
```

## Task 6: Document configuration, verify regressions, and perform the safe rollout

**Files:**
- Modify: `.env.example`
- Modify: `docs/nicepay-payment-integration.md`
- Modify: `scripts/test-nicepay-virtual-account-static.mjs`

**Interfaces:**
- Documents the exact deployment configuration and the post-deploy-only NICEPAY webhook action.
- Produces no runtime API or Sanity schema change.

- [ ] **Step 1: Add failing documentation assertions**

Require `.env.example` and `docs/nicepay-payment-integration.md` to contain all settings and rollout constraints:

```js
assert.match(envExample, /IYO_NICEPAY_METHODS=cardAndEasyPay,vbank/);
assert.match(envExample, /IYO_NICEPAY_VBANK_VALID_HOURS=3/);
assert.match(envExample, /IYO_NICEPAY_VBANK_ENABLED=0/);
assert.match(documentation, /https:\/\/www\.iyohouse\.com\/api\/payment\/webhook/);
assert.match(documentation, /가상계좌/);
assert.match(documentation, /200 OK/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:nicepay-vbank`

Expected: FAIL until the environment example and deployment guide include the virtual-account rollout.

- [ ] **Step 3: Document the deployment order**

Update `.env.example` with:

```text
IYO_NICEPAY_METHODS=cardAndEasyPay,vbank
IYO_NICEPAY_VBANK_VALID_HOURS=3
IYO_NICEPAY_VBANK_ENABLED=0
```

Add the following ordered production procedure to `docs/nicepay-payment-integration.md`:

1. Apply `20260729000001_add_virtual_account_payment_lifecycle.sql` in Supabase.
2. Deploy the code with `IYO_NICEPAY_VBANK_ENABLED=0`; card and easy payments remain operational while the account button is disabled.
3. In NICEPAY 관리자, register exactly `https://www.iyohouse.com/api/payment/webhook` and select 가상계좌 callback. Keep existing card callback selection.
4. Confirm NICEPAY’s registration probe receives HTTP `200 OK` from the deployed route.
5. Set `IYO_NICEPAY_VBANK_ENABLED=1` and redeploy.
6. Run one low-value real or sandbox virtual-account issuance, verify `pending/ready`, then make the deposit and verify exactly one `confirmed/success/paid` transition and capacity count increment.

- [ ] **Step 4: Run the full automated suite and production build**

Run:

```bash
npm run test:nicepay-vbank
npm run test:payment
node --test scripts/test-nicepay-webhook-registration-static.mjs
node --test scripts/test-admin-payment-details-static.mjs
node --test scripts/test-admin-schedule-change-static.mjs
node --test scripts/test-admin-cancelled-and-tutors-static.mjs
npm run test:workshop-schedule-capacity
npm run test:admin-security
npm run lint
set -a; source /Users/eojun/Developer/iyohouse-total/.env.local; set +a; npm run build
```

Expected: all test commands and build pass. Report any pre-existing lint warnings separately from new warnings.

- [ ] **Step 5: Run independent regression reviews before merge**

Dispatch two fresh reviewers against the final branch:

1. Payment reviewer: trace `create_pending_registration` through checkout, confirm, webhook, and capacity counts for card, easy payment, virtual-account ready, paid, expired, duplicate webhook, and browser-close cases.
2. Application reviewer: inspect Sanity sync, workshop detail layout, existing admin confirmed/cancelled/email/schedule features, profile history, and payment-page ownership boundaries for regressions.

Require file/line findings, fix validated issues, rerun the exact affected tests plus the complete suite above, and record the results in the final handoff.

- [ ] **Step 6: Commit documentation and verification changes**

```bash
git add .env.example docs/nicepay-payment-integration.md scripts/test-nicepay-virtual-account-static.mjs
git commit -m "Document NICEPAY virtual account rollout"
```

## Spec Coverage Review

- Two-button NICEPAY-style modal with close control: Task 4.
- NICEPAY-hosted card, KakaoPay, NaverPay, SamsungPay, and virtual-account UI: Tasks 1, 3, and 4.
- Three-hour virtual-account seat hold and pending/confirmed lifecycle: Tasks 2 and 3.
- Signed, idempotent, TID-specific webhook confirmation and expiry: Tasks 2 and 3.
- No production virtual-account issuance until webhook is registered and returns `200 OK`: Tasks 1 and 6.
- Separate, masked admin pending-account section without modifying confirmed/cancelled applicant controls: Task 5.
- Nicepay-style success, failure, and pending pages with owner-only account details: Tasks 3 and 4.
- Card, capacity, Sanity, admin, and layout regression protection: Tasks 3 through 6.
