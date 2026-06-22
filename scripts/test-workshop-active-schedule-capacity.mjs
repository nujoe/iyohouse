import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const path = join(root, relativePath);

  if (!existsSync(path)) {
    failures.push(`${relativePath} is missing.`);
    return "";
  }

  return readFileSync(path, "utf8");
}

function requireIncludes(relativePath, needles) {
  const content = read(relativePath);

  for (const needle of needles) {
    if (!content.includes(needle)) {
      failures.push(`${relativePath} is missing "${needle}".`);
    }
  }

  return content;
}

function requireExcludes(relativePath, needles) {
  const content = read(relativePath);

  for (const needle of needles) {
    if (content.includes(needle)) {
      failures.push(`${relativePath} must not contain "${needle}".`);
    }
  }

  return content;
}

function requireMatches(relativePath, checks) {
  const content = read(relativePath);

  for (const [pattern, message] of checks) {
    if (!pattern.test(content)) {
      failures.push(`${relativePath}: ${message}`);
    }
  }

  return content;
}

requireIncludes("src/sanity/schemaTypes/workshop.ts", [
  "name: 'isActive'",
  "initialValue: true",
  "일정별 정원 (명)",
]);

requireIncludes("src/sanity/actions/toggleWorkshopActiveAction.tsx", [
  "ToggleWorkshopActiveAction",
  "isActive",
  "patch.set",
]);

requireIncludes("src/sanity/config.ts", [
  "ToggleWorkshopActiveAction",
  "SyncWorkshopDbAction",
]);

requireMatches("src/app/api/workshops/data/route.ts", [
  [/_type == "workshop" && isActive != false/, "public workshop API must hide inactive Sanity workshops."],
  [/schedule_capacities/, "public workshop API must load per-schedule capacities from Supabase."],
  [/scheduleCounts/, "public workshop API must return per-schedule registration counts."],
  [/schedule_key/, "public workshop API must group counts by schedule key."],
]);

requireMatches("src/app/api/admin/sync-workshops/route.ts", [
  [/isActive/, "admin sync must read the Sanity active flag."],
  [/schedule\[\]/, "admin sync must read Sanity schedule entries."],
  [/schedule_capacities/, "admin sync must persist schedule capacity data."],
  [/getScheduleKey/, "admin sync must derive stable schedule keys."],
  [/ws\.isActive === false \? 'inactive'/, "admin sync must mark inactive workshops as inactive in Supabase."],
]);

requireIncludes("supabase/migrations/20260622000000_add_workshop_schedule_capacities.sql", [
  "schedule_capacities JSONB",
  "create_pending_registration",
  "v_schedule_capacity",
  "v_effective_capacity",
  "schedule_key = v_normalized_schedule_key",
  "status <> 'active'",
]);

requireIncludes("supabase/migrations/20260622001000_backfill_registration_schedule_columns.sql", [
  "ALTER TABLE public.workshop_registrations_v2",
  "ADD COLUMN IF NOT EXISTS schedule_key TEXT",
  "ADD COLUMN IF NOT EXISTS schedule_label TEXT",
  "ADD COLUMN IF NOT EXISTS schedule_date TEXT",
  "ADD COLUMN IF NOT EXISTS schedule_time TEXT",
  "ADD COLUMN IF NOT EXISTS snapshot_bio TEXT",
]);

requireIncludes("src/hooks/useWorkshopData.ts", [
  "scheduleCounts",
  "setScheduleCounts",
]);

requireIncludes("src/components/workshop/WorkshopDetailOverlay.tsx", [
  "scheduleCounts",
  "getSessionCapacity",
  "isScheduleFull",
  "getScheduleKey",
  "disabled={isFull}",
]);

requireExcludes("src/components/workshop/WorkshopDetailOverlay.tsx", [
  "s-capacity",
  "const sessionPaidCount = getSchedulePaidCount(workshop, session)",
  "const sessionCapacity = getSessionCapacity(workshop, session)",
]);

requireMatches("src/styles/10-overlays-responsive.css", [
  [/\.schedule-option\s*\{[\s\S]*?flex-direction:\s*row;/, "schedule options must lay out date and time on one line."],
  [/\.schedule-option\s*\{[\s\S]*?align-items:\s*center;/, "schedule options must vertically align one-line schedule content."],
  [/\.schedule-option\s*\{[\s\S]*?white-space:\s*nowrap;/, "schedule options must keep weekday, date, and time on one line."],
]);

requireExcludes("src/styles/10-overlays-responsive.css", [
  ".schedule-option .s-capacity",
  ".s-capacity",
]);

requireMatches("src/sanity/workshops.ts", [
  [/isActive != false/, "SEO workshop queries must hide inactive workshops."],
]);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("workshop active and schedule capacity checks passed.");
