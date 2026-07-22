import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("Sanity publish sync reuses the existing runtime mapping", () => {
  const servicePath = new URL("src/lib/admin/syncWorkshopRuntime.ts", root);
  assert.equal(existsSync(servicePath), true, "missing shared workshop runtime sync service");

  const service = read("src/lib/admin/syncWorkshopRuntime.ts");
  const adminRoute = read("src/app/api/admin/sync-workshops/route.ts");

  assert.match(service, /export async function syncSanityWorkshopRuntime/, "shared service must export a document sync function");
  assert.match(service, /student_price/, "shared service must preserve student price sync");
  assert.match(service, /schedule_capacities/, "shared service must preserve schedule capacity sync");
  assert.match(adminRoute, /syncSanityWorkshopRuntime/, "manual admin sync must use the shared service");
});

test("Sanity Publish webhook authenticates and scopes workshop sync", () => {
  const routePath = new URL("src/app/api/webhooks/sanity/workshop-publish/route.ts", root);
  assert.equal(existsSync(routePath), true, "missing Sanity workshop publish webhook route");

  const route = read("src/app/api/webhooks/sanity/workshop-publish/route.ts");

  assert.match(route, /parseBody/, "webhook must verify Sanity's signed raw body");
  assert.match(route, /SANITY_WEBHOOK_SECRET/, "webhook must require a server-only shared secret");
  assert.match(route, /sanity-project-id/, "webhook must validate the Sanity project");
  assert.match(route, /sanity-dataset/, "webhook must validate the Sanity dataset");
  assert.match(route, /syncSanityWorkshopRuntime/, "webhook must reuse the shared runtime sync service");
});

test("Studio relies on Publish instead of a separate DB sync action", () => {
  const config = read("src/sanity/config.ts");

  assert.doesNotMatch(config, /SyncWorkshopDbAction/, "Studio must not expose a separate DB sync action");
  assert.match(config, /ToggleWorkshopActiveAction/, "Studio active toggle must remain");
  assert.match(config, /GenerateWorkshopEnglishAction/, "Studio English generation action must remain");
});
