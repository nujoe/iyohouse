import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const schema = read("src/sanity/schemaTypes/workshop.ts");
const helper = read("src/lib/admin/workshopEmail.ts");
const route = read("src/app/api/admin/workshops/[workshopId]/send-email/route.ts");
const panel = read("src/components/admin/AdminWorkshopEmailPanel.tsx");

for (const needle of [
  "name: 'emailTemplate'",
  "title: '이 일정 이메일 템플릿'",
  "name: 'subject'",
  "name: 'body'",
  "name: 'ctaUrl'",
]) {
  assert.ok(schema.includes(needle), `Sanity schedule schema should include ${needle}`);
}

for (const needle of [
  "schedule_key",
  "scheduleKey",
  "getWorkshopScheduleEmailTemplates",
  "scheduleEmailTemplates",
  "selectWorkshopEmailTemplate",
  "fallbackTemplate",
]) {
  assert.ok(helper.includes(needle), `workshop email helper should support schedule templates with ${needle}`);
}

for (const needle of [
  "getWorkshopScheduleEmailTemplates",
  "selectWorkshopEmailTemplate",
  "scheduleEmailTemplates",
]) {
  assert.ok(route.includes(needle), `send email route should use schedule templates with ${needle}`);
}

assert.ok(
  route.includes("recipient.scheduleKey") && route.includes("selectWorkshopEmailTemplate"),
  "send email route should choose the email template per recipient schedule key.",
);

assert.ok(
  panel.includes("일정별 이메일 템플릿") || panel.includes("일정별 템플릿"),
  "admin email panel should tell admins that schedule-specific templates are supported.",
);

console.log("workshop schedule email static checks passed.");
