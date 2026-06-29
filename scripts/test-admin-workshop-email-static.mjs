import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const schema = read("src/sanity/schemaTypes/workshop.ts");
const adminPage = read("src/app/admin/workshops/[workshopId]/page.tsx");
const applicantsClient = read("src/components/admin/AdminWorkshopApplicantsClient.tsx");
const emailPanel = read("src/components/admin/AdminWorkshopEmailPanel.tsx");
const helper = read("src/lib/admin/workshopEmail.ts");
const adminStyles = read("src/styles/13-admin.css");
const routePath = new URL("../src/app/api/admin/workshops/[workshopId]/send-email/route.ts", import.meta.url);

assert.ok(existsSync(routePath), "admin workshop email send API route should exist");
const route = read("src/app/api/admin/workshops/[workshopId]/send-email/route.ts");

for (const needle of [
  "name: 'applicantEmailTemplate'",
  "title: '확정 신청자 이메일 템플릿'",
  "name: 'subject'",
  "name: 'body'",
  "name: 'ctaUrl'",
]) {
  assert.ok(schema.includes(needle), `Sanity workshop schema should include ${needle}`);
}

assert.ok(
  adminPage.includes("AdminWorkshopApplicantsClient") &&
    adminPage.includes("emailTemplate={emailTemplate}") &&
    adminPage.includes("applicantCount={applicantCount}") &&
    adminPage.includes("groups={groups}"),
  "admin workshop detail page should render the applicants client with template, groups, and confirmed recipient count",
);

for (const needle of [
  "selectedRegistrationIds",
  "selectedApplicantCount",
  "toggleApplicantSelection",
  "toggleGroupSelection",
  "toggleAllSelection",
  'type="checkbox"',
  "AdminWorkshopEmailPanel",
]) {
  assert.ok(applicantsClient.includes(needle), `admin applicants client should include ${needle}`);
}

for (const needle of [
  "selectedRegistrationIds",
  "selectedApplicantCount",
  "expectedRecipientCount: selectedApplicantCount",
  "selectedRegistrationIds,",
]) {
  assert.ok(emailPanel.includes(needle), `admin email panel should send selected recipients with ${needle}`);
}

const postIndex = route.indexOf("export async function POST");
const authIndex = route.indexOf("verifyAdminAccess(request)", postIndex);
const bodyIndex = route.indexOf("request.json()", postIndex);
assert.notEqual(postIndex, -1, "send email route should expose POST");
assert.notEqual(authIndex, -1, "send email route should verify admin access");
assert.notEqual(bodyIndex, -1, "send email route should parse request body");
assert.ok(authIndex < bodyIndex, "admin access must be verified before parsing request body");

for (const needle of [
  "expectedRecipientCount",
  "selectedRegistrationIds",
  "new Resend",
  "renderWorkshopEmail",
  "sendWorkshopEmailBatchWithRetry",
  "chunkEmails",
  "MAX_BATCH_EMAILS = 100",
  "resend.batch.send",
  "batchValidation: \"permissive\"",
  "isRateLimitError",
  "retryDelayMs",
  "await sleep",
]) {
  assert.ok(route.includes(needle), `send email route should include ${needle}`);
}

assert.ok(
  !route.includes("resend.emails.send"),
  "send email route should use Resend Batch API instead of one request per recipient",
);

assert.ok(
  !/\.in\("status",\s*\[[^\]]*pending/.test(route),
  "send email route must not include pending registrations",
);

for (const needle of [
  "getWorkshopApplicantEmailTemplate",
  "getConfirmedWorkshopEmailRecipients",
  'from("workshop_registrations_v2")',
  '.eq("workshop_id", workshopId)',
  '.eq("status", "confirmed")',
  '.in("id", registrationIds)',
  "seenEmails",
  "snapshot_email",
  "{name}",
  "{workshopTitle}",
  "{schedule}",
]) {
  assert.ok(helper.includes(needle), `workshop email helper should include ${needle}`);
}

assert.ok(
  !/\.in\("status",\s*\[[^\]]*pending/.test(helper),
  "workshop email helper must not include pending registrations",
);

assert.ok(
  adminStyles.includes(".admin-email-link-action") &&
    adminStyles.includes("text-decoration") &&
    !/\.admin-email-actions button\s*\{[^}]*background:\s*#000/s.test(adminStyles),
  "admin email actions should use hyperlink-style controls, not filled black buttons",
);

console.log("admin workshop email static checks passed.");
