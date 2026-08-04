# Schedule-Specific Waitlist Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a full workshop schedule with a Sanity waitlist URL to be selected and opened as a waitlist request while preserving normal payment behavior for available schedules.

**Architecture:** Keep the existing schedule capacity calculation and NICEPAY flow unchanged. Add a derived UI state for `full + waitlist URL`, allow only that state to remain selectable, and render the existing waitlist anchor instead of invoking payment. A full schedule without a URL and manually closed workshops remain closed.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing static Node tests, Sanity workshop data.

## Global Constraints

- Do not change Supabase RPCs, payment creation, NICEPAY callbacks, or capacity counting.
- Use the existing workshop-level `waitlistFormUrl` field.
- A missing waitlist URL must result in `마감` and no external navigation.
- Preserve mobile and desktop schedule selector layout.

---

### Task 1: Add regression expectations

**Files:**
- Modify: `scripts/test-workshop-waitlist-static.mjs`
- Test: `scripts/test-workshop-waitlist-static.mjs`

- [x] **Step 1: Add failing assertions**

Assert that the detail component contains separate full-schedule waitlist state, does not disable a full schedule when a waitlist URL exists, includes the localized `정원 마감 - 대기자 신청` copy, and keeps the payment handler guarded for full schedules.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node scripts/test-workshop-waitlist-static.mjs`

Expected: FAIL because the new state and copy do not yet exist.

### Task 2: Implement schedule-specific UI branching

**Files:**
- Modify: `src/components/workshop/WorkshopDetailOverlay.tsx`
- Modify: `src/lib/i18n/translations.ts`
- Modify: `src/styles/10-overlays-responsive.css`

- [x] **Step 1: Add localized status copy**

Add Korean `scheduleWaitlist: "정원 마감 - 대기자 신청"` and English `scheduleWaitlist: "Sold out - Join waitlist"` beside the existing `waitlistApply` text.

- [x] **Step 2: Derive the UI states**

Use the existing `isScheduleFull`, `waitlistFormUrl`, and `workshopManuallyClosed` values to derive:

```ts
const selectedScheduleWaitlist = Boolean(
  selectedScheduleFull && !workshopManuallyClosed && waitlistFormUrl,
);
const hasWaitlistSelectableSchedule = getWorkshopSchedule(workshop).some(
  (session: any) => isScheduleFull(workshop, session) && !workshopManuallyClosed && waitlistFormUrl,
);
const scheduleSelectorDisabled = workshopManuallyClosed ||
  (workshopClosedForPayment && !hasWaitlistSelectableSchedule);
```

- [x] **Step 3: Update schedule options**

Keep a full schedule clickable only when `selectedScheduleWaitlist`-equivalent conditions are true. Render its date/time plus `t.workshop.scheduleWaitlist`. Disable full schedules without a waitlist URL and all manually closed schedules.

- [x] **Step 4: Update the primary action**

Render the existing safe external anchor with `waitlistFormUrl`, `target="_blank"`, and `rel="noopener noreferrer"` when the selected schedule is waitlist-eligible. Keep the payment button and current payment guards for all other states.

- [x] **Step 5: Keep styling scoped**

Add only a status span style for the waitlist text. Preserve existing hover, disabled, border, and responsive layout rules.

### Task 3: Verify and publish

**Files:**
- Modify: only files listed above

- [x] **Step 1: Run focused static checks**

Run: `node scripts/test-workshop-waitlist-static.mjs`

Expected: PASS.

- [x] **Step 2: Run payment and capacity regression checks**

Run: `npm run test:payment && npm run test:workshop-schedule-capacity`

Expected: PASS; no payment or schedule-capacity regression.

- [x] **Step 3: Run scoped lint**

Run: `npx eslint src/components/workshop/WorkshopDetailOverlay.tsx src/lib/i18n/translations.ts`

Expected: PASS with no errors in the changed TypeScript files. The repository-wide command currently also scans an unrelated `.worktrees/admin-refunds/.next` generated tree.

- [x] **Step 4: Review the diff**

Run: `git diff --check` and `git diff --stat`.

Confirm that no Supabase migration, payment route, RPC call, or NICEPAY code changed.

- [x] **Step 5: Commit and push**

```bash
git add docs/superpowers/plans/2026-08-04-schedule-waitlist-selection.md scripts/test-workshop-waitlist-static.mjs src/components/workshop/WorkshopDetailOverlay.tsx src/lib/i18n/translations.ts src/styles/10-overlays-responsive.css
git commit -m "Handle waitlist per workshop schedule"
git push target HEAD:main
```
