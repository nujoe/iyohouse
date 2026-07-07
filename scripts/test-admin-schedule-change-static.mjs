import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migrationFile = "supabase/migrations/20260707000000_admin_change_registration_schedule.sql";

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("admin schedule change API is admin-only and uses atomic RPC", () => {
  const routePath = new URL("src/app/api/admin/workshops/[workshopId]/registrations/[registrationId]/schedule/route.ts", root);
  assert.equal(existsSync(routePath), true, "missing admin schedule change route");

  const route = read("src/app/api/admin/workshops/[workshopId]/registrations/[registrationId]/schedule/route.ts");
  assert.match(route, /verifyAdminAccess/, "route must verify admin access");
  assert.match(route, /await request\.json\(\)/, "route should parse payload after auth");
  assert(route.indexOf("verifyAdminAccess") < route.indexOf("await request.json()"), "auth must happen before body parsing");
  assert.match(route, /admin_change_registration_schedule/, "route must call the schedule-change RPC");
  assert.match(route, /p_workshop_id/, "route must pass workshop id to prevent cross-workshop mutation");
  assert.doesNotMatch(route, /amount|order_id|payment_key|price_type|discount_amount/, "route must not mutate payment fields");
});

test("admin applicant page receives schedule options and counts", () => {
  const admin = read("src/lib/admin/workshopAdmin.ts");
  assert.match(admin, /scheduleOptions/, "admin data must include Sanity schedule options");
  assert.match(admin, /scheduleCounts/, "admin data must include active schedule counts");
  assert.match(admin, /getWorkshopScheduleChangeData/, "admin data should use the schedule helper");

  const client = read("src/components/admin/AdminWorkshopApplicantsClient.tsx");
  assert.match(client, /일정 변경/, "client must expose schedule change controls");
  assert.match(client, /scheduleOptions/, "client must render schedule options");
  assert.match(client, /scheduleCounts/, "client must display or use schedule counts");
  assert.match(client, /router\.refresh\(\)/, "client must refresh after successful schedule change");
});

test("migration defines schedule-change RPC with capacity check and narrow update", () => {
  const migrationPath = new URL(migrationFile, root);
  assert.equal(existsSync(migrationPath), true, "missing schedule-change migration");

  const migration = read(migrationFile);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_change_registration_schedule/, "missing RPC");
  assert.match(migration, /p_workshop_id UUID/, "RPC must receive expected workshop id");
  assert.match(migration, /FOR UPDATE/, "RPC must lock rows during capacity check");
  assert.match(migration, /status = 'confirmed'/, "RPC must support confirmed registrations");
  assert.match(migration, /expires_at > NOW\(\)/, "RPC must count unexpired pending registrations");
  assert.match(migration, /schedule_key = v_schedule_key/, "RPC must update schedule key");
  assert.doesNotMatch(migration, /amount\s*=|order_id\s*=|payment_key\s*=|price_type\s*=|discount_amount\s*=/, "RPC must not update payment fields");
});
