import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("account workshop history API is authenticated and returns confirmed registrations only", () => {
  const routePath = new URL("src/app/api/account/workshop-history/route.ts", root);
  assert.equal(existsSync(routePath), true, "missing account workshop history API route");

  const route = read("src/app/api/account/workshop-history/route.ts");
  assert.match(route, /auth\.getUser\(\)/, "API must authenticate the current user");
  assert.match(route, /status['"]?\s*,?\s*['"]confirmed|eq\(['"]status['"],\s*['"]confirmed['"]\)/, "API must filter confirmed registrations");
  assert.match(route, /eq\(['"]user_id['"],\s*user\.id\)/, "API must scope registrations to the current user");
  assert.match(route, /supabase_workshop_id/, "API must join Sanity workshop data by Supabase workshop id");
  assert.match(route, /posterMeta/, "API must return poster dimensions for layout");
});

test("profile modal includes tabbed account history without workshop navigation", () => {
  const modal = read("src/components/home/LoginModal.tsx");
  assert.match(modal, /AccountWorkshopHistory/, "profile modal must render the account workshop history component");
  assert.match(modal, /accountActiveTab/, "profile modal must keep tab state");
  assert.match(modal, /정보 수정/, "profile modal must include the profile edit tab label");
  assert.match(modal, /워크숍 신청 내역/, "profile modal must include the workshop history tab label");

  const historyPath = new URL("src/components/home/AccountWorkshopHistory.tsx", root);
  assert.equal(existsSync(historyPath), true, "missing account workshop history component");

  const history = read("src/components/home/AccountWorkshopHistory.tsx");
  assert.match(history, /\/api\/account\/workshop-history/, "history component must load the dedicated account API");
  assert.match(history, /workshop-history-item[\s\S]*is-reversed/, "history component must alternate poster/text layout");
  assert.match(history, /workshop-history-description/, "history component must render a clamped description");
  assert.doesNotMatch(history, /href=|router\.push|window\.location/, "poster should not navigate to workshop detail yet");
});
