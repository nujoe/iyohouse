import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("workshop list and detail render Sanity tags with WORKSHOP fallback", () => {
  const helper = read("src/lib/workshopTags.ts");
  assert.match(helper, /getWorkshopTags/, "missing shared workshop tag normalizer");
  assert.match(helper, /\["WORKSHOP"\]/, "tag normalizer must fallback to WORKSHOP");
  assert.match(helper, /getWorkshopTagColor/, "missing shared workshop tag color helper");

  const grid = read("src/components/WorkshopGrid.tsx");
  assert.match(grid, /getWorkshopTags\(ws\.tags\)/, "workshop grid must render ws.tags");
  assert.match(grid, /dot-\$\{getWorkshopTagColor\(tag\)\}/, "workshop grid must apply tag color classes");
  assert.doesNotMatch(grid, /<span className="dot-yellow">WORKSHOP<\/span>/, "workshop grid must not hardcode only WORKSHOP");

  const overlay = read("src/components/workshop/WorkshopDetailOverlay.tsx");
  assert.match(overlay, /getWorkshopTags\(workshop\.tags\)/, "workshop overlay must render workshop.tags");
  assert.match(overlay, /pill-\$\{getWorkshopTagColor\(tag\)\}/, "workshop overlay must apply tag color classes");
  assert.doesNotMatch(overlay, /<span className="pills pill-yellow">WORKSHOP<\/span>/, "workshop overlay must not hardcode only WORKSHOP");

  const page = read("src/app/workshops/[slug]/page.tsx");
  assert.match(page, /getWorkshopTags\(workshop\.tags\)/, "workshop slug page must render normalized tags");
  assert.match(page, /pill-\$\{getWorkshopTagColor\(tag\)\}/, "workshop slug page must apply tag color classes");
});
