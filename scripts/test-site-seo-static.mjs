import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const siteSource = readFileSync(new URL("../src/lib/site.ts", import.meta.url), "utf8");

assert.ok(
  siteSource.includes('export const SITE_NAME = "이요하우스 IYOHOUSE";'),
  "SITE_NAME should include the Korean brand keyword for search metadata",
);
assert.ok(
  siteSource.includes("이요하우스는 창작자를 위한 자유실험공간입니다."),
  "SITE_DESCRIPTION should include the Korean brand keyword and description",
);

console.log("site SEO checks passed.");
