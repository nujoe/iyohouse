import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../src/styles/11-member-contact-sidebar.css", import.meta.url),
  "utf8",
);

assert.ok(
  css.includes("--mobile-sidebar-hamburger-width: clamp(13px, 3.8vw, 17px);"),
  "mobile sidebar hamburger lines should stay at their original length",
);

console.log("mobile sidebar icon checks passed.");
