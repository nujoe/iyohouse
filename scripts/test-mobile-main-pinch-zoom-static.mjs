import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mobileScrollCss = readFileSync(
  new URL("../src/styles/12-mobile-scroll-layout.css", import.meta.url),
  "utf8",
);

assert.ok(
  /\.cell-main\s*\{[\s\S]*overflow-x:\s*hidden\s*!important;/.test(mobileScrollCss),
  "mobile main cell should keep horizontal overflow hidden",
);

assert.ok(
  /\.cell-main\s*\{[\s\S]*overscroll-behavior:\s*none\s*!important;/.test(mobileScrollCss),
  "mobile main cell should keep overscroll disabled",
);

assert.ok(
  /\.preset-main \.cell-main,\s*\.grid-preset-main \.cell-main\s*\{[\s\S]*touch-action:\s*pan-y pinch-zoom\s*!important;/.test(mobileScrollCss),
  "mobile main preset should allow pinch zoom while keeping vertical pan",
);

console.log("mobile main pinch zoom checks passed.");
