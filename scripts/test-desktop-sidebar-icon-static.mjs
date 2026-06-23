import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/01-sidebar.css", import.meta.url), "utf8");

assert.ok(
  css.includes(".panel-icon") && css.includes("width: 48px;"),
  "desktop sidebar hamburger button should be 2px shorter",
);

console.log("desktop sidebar icon checks passed.");
