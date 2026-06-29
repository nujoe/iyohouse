import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const schema = read("src/sanity/schemaTypes/workshop.ts");
const adminPage = read("src/app/admin/workshops/[workshopId]/page.tsx");
const helper = read("src/lib/admin/workshopEmail.ts");
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
  adminPage.includes("AdminWorkshopEmailPanel") &&
    adminPage.includes("emailTemplate={emailTemplate}") &&
    adminPage.includes("applicantCount={applicantCount}"),
  "admin workshop detail page should render the email panel with template and confirmed recipient count",
);

const postIndex = route.indexOf("export async function POST");
const authIndex = route.indexOf("verifyAdminAccess(request)", postIndex);
const bodyIndex = route.indexOf("request.json()", postIndex);
assert.notEqual(postIndex, -1, "send email route should expose POST");
assert.notEqual(authIndex, -1, "send email route should verify admin access");
assert.notEqual(bodyIndex, -1, "send email route should parse request body");
assert.ok(authIndex < bodyIndex, "admin access must be verified before parsing request body");

for (const needle of [
  "expectedRecipientCount",
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

console.log("admin workshop email static checks passed.");
