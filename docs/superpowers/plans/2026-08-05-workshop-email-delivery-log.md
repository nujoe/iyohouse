# Workshop Email Delivery Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 워크숍 신청자 목록에서 확정 신청자별 이메일 발송 상태와 최근 발송 시각을 확인할 수 있게 한다.

**Architecture:** Resend 발송 결과를 기존 신청·결제 데이터와 분리된 Supabase `workshop_email_delivery_logs` 테이블에 시도별로 기록한다. 발송 API는 기존 확정 신청자 필터·응답 형식을 유지하고, Resend 웹훅은 서명을 검증한 뒤 메시지 ID로 `delivered` 또는 `bounced`를 갱신한다. 관리자 서버 페이지가 최신 로그를 조회해 클라이언트에 전달하고, 발송 직후에는 API 응답으로 화면 상태를 즉시 갱신한다.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Supabase service-role client, Resend Node SDK 6, static Node test scripts.

## Global Constraints

- 결제, 신청 상태, 정원 계산, NICEPAY route와 public workshop UI를 수정하지 않는다.
- 이메일 수신자는 기존처럼 `status = 'confirmed'` 신청자만 허용한다.
- Resend API가 접수한 시도는 `sent`, 수신자 단위 실패는 `failed`로 즉시 기록한다.
- Resend 웹훅은 raw body와 `svix-id`, `svix-timestamp`, `svix-signature`를 검증한다.
- 새 로그 테이블은 `anon`과 `authenticated`에 직접 접근을 허용하지 않고 service role만 사용한다.
- 재발송은 허용하되 기존 이력은 삭제하지 않고 새 `batch_id`로 별도 기록한다.

---

### Task 1: Add failing static coverage for delivery logging

**Files:**
- Modify: `scripts/test-admin-workshop-email-static.mjs`
- Create: `scripts/test-admin-workshop-email-delivery-static.mjs`

**Interfaces:**
- Consumes: Existing send-email route, admin applicants client, workshop admin loader, and migration directory.
- Produces: Failing assertions for the new migration, batch outcome mapping, status loading, response updates, and signed webhook route.

- [ ] **Step 1: Write the failing test**

Add `scripts/test-admin-workshop-email-delivery-static.mjs` with assertions that:

```js
assert.ok(existsSync(new URL("../supabase/migrations/20260805000000_add_workshop_email_delivery_logs.sql", import.meta.url)));
assert.match(route, /workshop_email_delivery_logs/);
assert.match(route, /batchId/);
assert.match(route, /providerMessageId/);
assert.match(helper, /getLatestWorkshopEmailStatuses/);
assert.match(client, /emailStatuses/);
assert.match(webhook, /resend\.webhooks\.verify/);
assert.match(webhook, /svix-signature/);
```

Also assert that the existing send route still contains `.eq("status", "confirmed")` through its helper, uses `resend.batch.send`, and does not call payment or registration update functions.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs`

Expected: FAIL because the migration, status helper, delivery webhook, and client props do not yet exist.

- [ ] **Step 3: Do not add production code in this task**

Keep this task limited to test coverage so the first failure proves the tests cover missing behavior.

- [ ] **Step 4: Commit the red tests**

```bash
git add scripts/test-admin-workshop-email-static.mjs scripts/test-admin-workshop-email-delivery-static.mjs
git commit -m "test: cover workshop email delivery tracking"
```

---

### Task 2: Create the private Supabase email delivery log

**Files:**
- Create: `supabase/migrations/20260805000000_add_workshop_email_delivery_logs.sql`
- Modify: `scripts/test-admin-workshop-email-delivery-static.mjs`

**Interfaces:**
- Consumes: `public.workshops`, `public.workshop_registrations_v2`, and the service-role access pattern in existing migrations.
- Produces: `public.workshop_email_delivery_logs` with status values `sent`, `delivered`, `failed`, and `bounced`.

- [ ] **Step 1: Add migration assertions first**

Assert the migration contains these exact safety properties:

```js
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.workshop_email_delivery_logs/);
assert.match(migration, /status TEXT NOT NULL/);
assert.match(migration, /sent.*delivered.*failed.*bounced/s);
assert.match(migration, /ALTER TABLE public\.workshop_email_delivery_logs ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.workshop_email_delivery_logs FROM anon, authenticated/);
assert.match(migration, /GRANT ALL ON TABLE public\.workshop_email_delivery_logs TO service_role/);
assert.match(migration, /UNIQUE.*batch_id.*registration_id/s);
assert.match(migration, /provider_message_id/);
```

- [ ] **Step 2: Run the focused test to verify the migration assertions fail**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs`

Expected: FAIL until the migration is created.

- [ ] **Step 3: Create the migration**

Create the table with UUID primary key, workshop and registration foreign keys with `ON DELETE CASCADE`, recipient name/email snapshots, template key, subject snapshot, status check constraint, provider message ID, batch ID, failure reason, sender ID, `sent_at`, `updated_at`, and a unique `(batch_id, registration_id)` constraint. Add indexes for `(workshop_id, sent_at DESC)`, `(registration_id, sent_at DESC)`, `(status, sent_at DESC)`, and a partial unique index for non-null provider message IDs. Enable RLS, revoke direct client roles, and grant service role access.

- [ ] **Step 4: Run SQL safety checks**

Run: `git diff --check -- supabase/migrations/20260805000000_add_workshop_email_delivery_logs.sql`

Expected: no whitespace errors. Apply this migration to Supabase only after the repository implementation is verified; this task creates the migration file and does not mutate production.

- [ ] **Step 5: Commit the migration**

```bash
git add supabase/migrations/20260805000000_add_workshop_email_delivery_logs.sql scripts/test-admin-workshop-email-delivery-static.mjs
git commit -m "feat: add private workshop email delivery log"
```

---

### Task 3: Add batch outcome mapping and server log helpers

**Files:**
- Create: `src/lib/admin/workshopEmailDelivery.ts`
- Modify: `src/lib/admin/workshopEmail.ts`
- Modify: `scripts/test-admin-workshop-email-delivery-static.mjs`

**Interfaces:**
- Consumes: Resend permissive batch response and `AdminWorkshopEmailRecipient`.
- Produces:
  - `type AdminWorkshopEmailDeliveryStatus = "sent" | "delivered" | "failed" | "bounced"`.
  - `type AdminWorkshopEmailStatus = { status: AdminWorkshopEmailDeliveryStatus; sentAt: string; updatedAt: string }`.
  - `resolveWorkshopEmailBatchOutcomes(result, recipientCount)` returning one outcome per input index.
  - `recordWorkshopEmailDeliveryLogs(client, rows)` using an idempotent upsert on `(batch_id, registration_id)`.
  - `getLatestWorkshopEmailStatuses(client, workshopId, registrationIds)` returning a map keyed by registration ID.

- [ ] **Step 1: Add a failing behavior test for outcome mapping**

Add assertions for a permissive response with one failed index:

```js
assert.match(deliveryHelper, /resolveWorkshopEmailBatchOutcomes/);
assert.match(deliveryHelper, /failed/);
assert.match(deliveryHelper, /providerMessageId/);
```

The test must expect successful IDs to be assigned to successful input indexes while the error index receives `failed` and its message.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs`

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Implement minimal outcome mapping**

Treat `data.data` IDs as ordered successful results and `data.errors[].index` as failed input indexes. If the batch request has a global error with `index: -1`, return `failed` for every input. Preserve one outcome per recipient even if the provider response omits a message ID.

- [ ] **Step 4: Implement private Supabase helpers**

`recordWorkshopEmailDeliveryLogs` inserts or updates only delivery-log rows, logs errors to the caller, and never updates registrations or payments. `getLatestWorkshopEmailStatuses` orders by `sent_at DESC`, keeps the first row per registration, and returns no entry for registrations without a log.

- [ ] **Step 5: Run the focused test to verify the helpers pass**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs`

Expected: the helper assertions pass; route/UI assertions remain red until later tasks.

- [ ] **Step 6: Commit the helper layer**

```bash
git add src/lib/admin/workshopEmailDelivery.ts src/lib/admin/workshopEmail.ts scripts/test-admin-workshop-email-delivery-static.mjs
git commit -m "feat: add workshop email delivery helpers"
```

---

### Task 4: Record send results without changing email or payment behavior

**Files:**
- Modify: `src/app/api/admin/workshops/[workshopId]/send-email/route.ts`
- Modify: `src/components/admin/AdminWorkshopEmailPanel.tsx`
- Modify: `scripts/test-admin-workshop-email-static.mjs`
- Modify: `scripts/test-admin-workshop-email-delivery-static.mjs`

**Interfaces:**
- Consumes: `resolveWorkshopEmailBatchOutcomes`, `recordWorkshopEmailDeliveryLogs`, `AdminWorkshopEmailStatus`.
- Produces: Existing response fields plus `batchId` and `deliveryStatuses` keyed by registration ID.

- [ ] **Step 1: Add failing route assertions**

Assert the route creates a per-request batch ID, preserves `sentCount`, `failedCount`, and `recipientCount`, records both success and failure outcomes, and uses `auth.userId` as `sent_by` when available.

- [ ] **Step 2: Run the test to verify failure**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs`

Expected: FAIL because the send route has no log recording or delivery status response.

- [ ] **Step 3: Integrate outcome logging**

Generate `crypto.randomUUID()` once per request. For each batch chunk, call the existing retry helper unchanged, resolve outcomes against the original chunk, and upsert rows with workshop ID, registration ID, recipient snapshots, schedule template key, subject, provider message ID, batch ID, sender ID, status, and failure reason. A log write failure is logged server-side and does not turn a successful Resend send into a failed email response.

- [ ] **Step 4: Extend the response and panel callback**

Return `deliveryStatuses` for every recipient outcome. Add an optional callback to `AdminWorkshopEmailPanel`; after a JSON response, pass the status map to the parent while keeping the existing success/error message behavior and confirmation reset.

- [ ] **Step 5: Run focused tests and existing email tests**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs scripts/test-admin-workshop-email-static.mjs scripts/test-workshop-schedule-email-static.mjs`

Expected: PASS. Existing recipient filtering, schedule templates, batch sending, and response counts remain intact.

- [ ] **Step 6: Commit the send integration**

```bash
git add 'src/app/api/admin/workshops/[workshopId]/send-email/route.ts' src/components/admin/AdminWorkshopEmailPanel.tsx scripts/test-admin-workshop-email-static.mjs scripts/test-admin-workshop-email-delivery-static.mjs
git commit -m "feat: record workshop email send outcomes"
```

---

### Task 5: Load and render the latest email status in the admin table

**Files:**
- Modify: `src/lib/admin/workshopAdmin.ts`
- Modify: `src/app/admin/workshops/[workshopId]/page.tsx`
- Modify: `src/components/admin/AdminWorkshopApplicantsClient.tsx`
- Modify: `src/styles/13-admin.css`
- Modify: `scripts/test-admin-workshop-email-delivery-static.mjs`

**Interfaces:**
- Consumes: `getLatestWorkshopEmailStatuses` and the panel delivery status callback.
- Produces: `emailStatuses` prop and a mail-status cell for each confirmed applicant.

- [ ] **Step 1: Add failing UI/data assertions**

Assert the server data type and page pass `emailStatuses`, the client renders `미발송`, `메일 발송됨`, `전달 완료`, `반송`, and `발송 실패`, and the CSS contains a compact status style.

- [ ] **Step 2: Run the test to verify failure**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs`

Expected: FAIL because the admin data and table have no email status field.

- [ ] **Step 3: Load latest statuses in the server data layer**

After loading confirmed applicant rows, query the new table by workshop and registration IDs. Add `emailStatuses` to `AdminWorkshopApplicantsData` and pass it through the page without exposing it to public pages.

- [ ] **Step 4: Render status and recent time in the client**

Initialize local status state from the server map. Add a `메일` column after the email column. Use `미발송` when no log exists; otherwise render a label and `formatAdminDateTime(sentAt)` in the same cell. On panel callback, merge statuses by registration ID so the table updates immediately after sending.

- [ ] **Step 5: Add restrained table styling**

Keep the existing horizontal-scroll table and add only compact status badge styles. Use readable colors and no layout changes to payment, capacity, schedule, or applicant fields.

- [ ] **Step 6: Run focused UI/static checks**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs scripts/test-admin-cancelled-and-tutors-static.mjs scripts/test-admin-payment-details-static.mjs`

Expected: PASS with payment and cancelled-applicant invariants unchanged.

- [ ] **Step 7: Commit the admin status UI**

```bash
git add src/lib/admin/workshopAdmin.ts 'src/app/admin/workshops/[workshopId]/page.tsx' src/components/admin/AdminWorkshopApplicantsClient.tsx src/styles/13-admin.css scripts/test-admin-workshop-email-delivery-static.mjs
git commit -m "feat: show workshop email delivery status in admin"
```

---

### Task 6: Add a signed Resend delivery webhook

**Files:**
- Create: `src/app/api/webhooks/resend/route.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `scripts/test-admin-workshop-email-delivery-static.mjs`

**Interfaces:**
- Consumes: Resend event payloads and `RESEND_WEBHOOK_SECRET`.
- Produces: `POST /api/webhooks/resend` that returns 200 for valid known/unknown events and updates matched log rows.

- [ ] **Step 1: Add failing webhook assertions**

Assert the route reads `request.text()` before parsing, checks the signing secret, calls `resend.webhooks.verify`, reads the event message ID, handles `email.delivered` and `email.bounced`, and returns a 200 response for unmatched valid messages.

- [ ] **Step 2: Run the test to verify failure**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs`

Expected: FAIL because the webhook route and environment documentation do not exist.

- [ ] **Step 3: Implement raw-body signature verification**

Read the raw request body. Require `RESEND_WEBHOOK_SECRET`, pass `svix-id`, `svix-timestamp`, and `svix-signature` to `resend.webhooks.verify`, and return 400 for missing or invalid signatures. Do not use admin session authentication on this provider callback.

- [ ] **Step 4: Apply idempotent delivery updates**

For `email.delivered`, update matching provider message IDs to `delivered`; for `email.bounced`, update them to `bounced`. Ignore unrelated event types and unknown IDs with HTTP 200. Never update registrations or payments. Log only safe event type and message ID metadata.

- [ ] **Step 5: Document deployment configuration**

Add `RESEND_WEBHOOK_SECRET` to `.env.example` and document the endpoint URL `https://www.iyohouse.com/api/webhooks/resend` plus the required Resend events (`email.delivered`, `email.bounced`) in `README.md`.

- [ ] **Step 6: Run webhook and full relevant tests**

Run: `node --test scripts/test-admin-workshop-email-delivery-static.mjs scripts/test-admin-workshop-email-static.mjs scripts/test-nicepay-webhook-registration-static.mjs`

Expected: PASS. NICEPAY webhook behavior remains unchanged.

- [ ] **Step 7: Commit the webhook**

```bash
git add 'src/app/api/webhooks/resend/route.ts' .env.example README.md scripts/test-admin-workshop-email-delivery-static.mjs
git commit -m "feat: track resend delivery webhooks"
```

---

### Task 7: Final verification and integration handoff

**Files:**
- Verify all files from Tasks 1-6.

**Interfaces:**
- Consumes: Repository implementation and migration file.
- Produces: Verified local build and explicit production migration/configuration instructions.

- [ ] **Step 1: Run the focused email test suite**

Run: `node --test scripts/test-admin-workshop-email-static.mjs scripts/test-workshop-schedule-email-static.mjs scripts/test-admin-workshop-email-delivery-static.mjs`

- [ ] **Step 2: Run payment and admin security regression tests**

Run: `npm run test:payment && npm run test:admin-security && npm run test:nicepay-vbank`

Expected: PASS; no payment, NICEPAY, capacity, or admin auth regression.

- [ ] **Step 3: Run lint and build**

Run: `npm run lint && npm run build`

Expected: no lint or TypeScript/build errors.

- [ ] **Step 4: Review the final diff**

Run: `git diff target/main...HEAD --stat` and `git status --short`.

Confirm unrelated `.worktrees/` and existing Sanity plan files remain untouched, and confirm no payment or public workshop files were changed.

- [ ] **Step 5: Provide deployment handoff**

Before production use, apply `20260805000000_add_workshop_email_delivery_logs.sql` in Supabase and set `RESEND_WEBHOOK_SECRET` in Vercel. Register the Resend webhook endpoint and enable the two delivery events. Do not claim production status until those external steps are completed.
