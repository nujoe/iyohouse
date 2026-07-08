import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("admin detail displays cancelled registrations separately without changing confirmed operations", () => {
  const admin = read("src/lib/admin/workshopAdmin.ts");
  assert.match(admin, /cancelledGroups/, "admin detail data must expose cancelled groups separately");
  assert.match(admin, /cancelledCount/, "admin detail data must expose cancelled count separately");
  assert.match(admin, /\.eq\("status",\s*"confirmed"\)/, "confirmed applicant groups must stay confirmed-only");
  assert.match(admin, /\.eq\("status",\s*"cancelled"\)/, "admin detail must query cancelled registrations separately");
  assert.match(admin, /price_type/, "admin applicant query must include price_type for student highlighting");

  const client = read("src/components/admin/AdminWorkshopApplicantsClient.tsx");
  assert.match(client, /cancelledGroups/, "client must render cancelled groups separately");
  assert.match(client, /admin-cancelled-applicant-row/, "cancelled rows must use a muted row class");
  assert.match(client, /취소\/환불/, "cancelled rows must show a cancel/refund status badge");
  assert.match(client, /price_type === "student"/, "student applicants must be detected from registration price_type");
  assert.match(client, /is-student-discount/, "student applicant names must use the student highlight class");
  assert.match(client, /allRegistrationIds = useMemo\(\s*\(\) => groups\.flatMap/, "email selection must remain confirmed groups only");
});

test("admin cancelled display does not weaken payment, email, or capacity invariants", () => {
  const email = read("src/lib/admin/workshopEmail.ts");
  assert.match(email, /\.eq\("status",\s*"confirmed"\)/, "bulk email recipients must remain confirmed-only");
  assert.doesNotMatch(email, /cancelled/, "bulk email helper must not include cancelled recipients");

  const schedule = read("src/lib/admin/workshopScheduleChange.ts");
  assert.match(schedule, /\.in\("status",\s*\["confirmed",\s*"pending"\]\)/, "schedule capacity counts must stay active-only");
  assert.doesNotMatch(schedule, /cancelled/, "cancelled rows must not count toward schedule capacity");

  const checkout = read("src/app/api/payment/checkout/route.ts");
  const confirm = read("src/app/api/payment/confirm/route.ts");
  const webhook = read("src/app/api/payment/webhook/route.ts");
  assert.match(checkout, /registration\.status !== "pending"/, "checkout must still require pending registrations");
  assert.match(confirm, /registration\.status === "confirmed"/, "confirm route must keep confirmed idempotency guard");
  assert.match(confirm, /registration\.status !== "pending"/, "confirm route must still reject non-pending registrations");
  assert.match(webhook, /\.in\("status",\s*\["pending",\s*"confirmed"\]\)/, "webhook cancellation must only cancel active registrations");
});

test("Sanity supports multiple tutors and iyoca uses club leader label", () => {
  const schema = read("src/sanity/schemaTypes/workshop.ts");
  assert.match(schema, /name: 'tutors'/, "workshop schema must add a tutors array");
  assert.match(schema, /title: '튜터'/, "tutors array should appear as a tutor field in Studio");
  assert.match(schema, /name: 'nameEn'/, "tutor object should support English names");
  assert.match(schema, /name: 'bioEn'/, "tutor object should support English bios");

  const query = read("src/sanity/workshops.ts");
  assert.match(query, /tutors/, "SEO workshop projection must include tutors");

  const localization = read("src/lib/i18n/workshopLocalization.ts");
  assert.match(localization, /getLocalizedWorkshopTutors/, "localization must expose plural tutor helper");
  assert.match(localization, /workshop\.tutors/, "plural helper must prefer workshop.tutors");
  assert.match(localization, /workshop\.tutor/, "plural helper must fall back to legacy tutor field");

  const tags = read("src/lib/workshopTags.ts");
  assert.match(tags, /isIyocaWorkshop/, "tag helper must expose iyoca detection");

  const translations = read("src/lib/i18n/translations.ts");
  assert.match(translations, /clubLeaderLabel/, "translations must include club leader label");
  assert.match(translations, /동아리장/, "Korean club leader label must use 동아리장");

  const grid = read("src/components/WorkshopGrid.tsx");
  assert.match(grid, /isIyocaWorkshop\(ws\.tags\)/, "grid must choose label using normalized IYOCA tags");
  assert.match(grid, /getLocalizedWorkshopTutorNames/, "grid must render plural tutor names");

  const overlay = read("src/components/workshop/WorkshopDetailOverlay.tsx");
  assert.match(overlay, /isIyocaWorkshop\(workshop\.tags\)/, "overlay must choose label using normalized IYOCA tags");
  assert.match(overlay, /getLocalizedWorkshopTutors/, "overlay must render plural tutor details");

  const page = read("src/app/workshops/[slug]/page.tsx");
  assert.match(page, /isIyocaWorkshop\(workshop\.tags\)/, "SEO detail page must choose label using normalized IYOCA tags");
  assert.match(page, /getLocalizedWorkshopTutors/, "SEO detail page must render plural tutor details");
});

