import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function readOptional(path) {
  const file = new URL(`../${path}`, import.meta.url);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const migrationPath = "supabase/migrations/20260805000000_add_workshop_email_delivery_logs.sql";
const route = read("src/app/api/admin/workshops/[workshopId]/send-email/route.ts");
const helper = read("src/lib/admin/workshopEmail.ts");
const deliveryHelper = readOptional("src/lib/admin/workshopEmailDelivery.ts");
const client = read("src/components/admin/AdminWorkshopApplicantsClient.tsx");
const adminPage = read("src/app/admin/workshops/[workshopId]/page.tsx");
const webhook = readOptional("src/app/api/webhooks/resend/route.ts");
const adminData = read("src/lib/admin/workshopAdmin.ts");
const adminStyles = read("src/styles/13-admin.css");
const migration = readOptional(migrationPath);

test("workshop email delivery tracking has a private migration", () => {
  assert.ok(existsSync(new URL(`../${migrationPath}`, import.meta.url)), "delivery log migration should exist");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.workshop_email_delivery_logs/);
  assert.match(migration, /status TEXT NOT NULL/);
  assert.match(migration, /sent.*delivered.*failed.*bounced/s);
  assert.match(migration, /ALTER TABLE public\.workshop_email_delivery_logs ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.workshop_email_delivery_logs FROM anon, authenticated/);
  assert.match(migration, /GRANT ALL ON TABLE public\.workshop_email_delivery_logs TO service_role/);
  assert.match(migration, /UNIQUE.*batch_id.*registration_id/s);
  assert.match(migration, /provider_message_id/);
});

test("batch delivery outcomes preserve recipient indexes and provider IDs", () => {
  assert.match(deliveryHelper, /resolveWorkshopEmailBatchOutcomes/);
  assert.match(deliveryHelper, /providerMessageId/);
  assert.match(deliveryHelper, /failureReason/);
  assert.match(deliveryHelper, /failed/);
});

test("send route records outcomes without leaving the confirmed-recipient flow", () => {
  assert.match(route, /workshop_email_delivery_logs/);
  assert.match(route, /batchId/);
  assert.match(route, /providerMessageId/);
  assert.match(route, /resend\.batch\.send/);
  assert.match(helper, /\.eq\("status",\s*"confirmed"\)/);
  assert.doesNotMatch(route, /\.update\([^)]*status\s*:/s, "email logging must not update registration status");
  assert.doesNotMatch(route, /confirm_payment|cancel_registration|payments/);
});

test("admin page passes latest delivery statuses to the applicants table", () => {
  assert.match(adminData, /getLatestWorkshopEmailStatuses/);
  assert.match(adminData, /emailStatuses/);
  assert.match(adminPage, /emailStatuses=\{emailStatuses\}/);
  assert.match(client, /emailStatuses/);
  for (const label of ["미발송", "메일 발송됨", "전달 완료", "반송", "발송 실패"]) {
    assert.match(client, new RegExp(label));
  }
  assert.match(adminStyles, /admin-email-status/);
});

test("Resend webhook verifies the raw signed request and updates delivery status", () => {
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /resend\.webhooks\.verify/);
  assert.match(webhook, /svix-signature/);
  assert.match(webhook, /email\.delivered/);
  assert.match(webhook, /email\.bounced/);
  assert.match(webhook, /workshop_email_delivery_logs/);
  assert.match(webhook, /status:\s*200|status:\s*\}\s*\)/);
});

console.log("workshop email delivery static checks loaded.");
