import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlayCss = readFileSync(
  new URL("../src/styles/10-overlays-responsive.css", import.meta.url),
  "utf8",
);
const homeCss = readFileSync(
  new URL("../src/styles/03-home.css", import.meta.url),
  "utf8",
);
const mobileScrollCss = readFileSync(
  new URL("../src/styles/12-mobile-scroll-layout.css", import.meta.url),
  "utf8",
);

assert.ok(
  /\.form-input-classic,\s*\.form-textarea-classic\s*\{[\s\S]*font-size:\s*16px\s*!important;/.test(overlayCss),
  "mobile contact input and textarea font-size should be at least 16px to prevent iOS Safari focus zoom",
);
assert.ok(
  !/\.form-input-classic,\s*\.form-textarea-classic\s*\{[\s\S]*font-size:\s*1[0-5]px\s*!important;/.test(overlayCss),
  "mobile contact input and textarea should not be forced below 16px",
);
assert.ok(
  /\.contact-form input,\s*\.contact-form textarea\s*\{[\s\S]*font-size:\s*16px\s*!important;/.test(homeCss),
  "legacy mobile contact selectors should also avoid iOS Safari focus zoom",
);
assert.ok(
  /\.left-panel\.contact-mode \.form-input-classic,\s*\.left-panel\.contact-mode \.form-textarea-classic\s*\{[\s\S]*font-size:\s*16px\s*!important;/.test(mobileScrollCss),
  "contact mode should keep focused fields at 16px even after later mobile overrides",
);

console.log("mobile contact input zoom checks passed.");
