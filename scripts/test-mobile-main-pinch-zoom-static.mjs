import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mobileScrollCss = readFileSync(
  new URL("../src/styles/12-mobile-scroll-layout.css", import.meta.url),
  "utf8",
);
const homeCss = readFileSync(
  new URL("../src/styles/03-home.css", import.meta.url),
  "utf8",
);
const layoutTsx = readFileSync(
  new URL("../src/app/layout.tsx", import.meta.url),
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

assert.ok(
  /\.preset-main \.main-text-column,\s*\.preset-main \.main-intro-title,\s*\.preset-main \.main-intro-text\s*\{[\s\S]*touch-action:\s*pan-y pinch-zoom\s*!important;/.test(homeCss),
  "mobile main text touch targets should explicitly allow pinch zoom",
);

assert.ok(
  /import type \{ Metadata,\s*Viewport \} from "next";/.test(layoutTsx) &&
    /export const viewport:\s*Viewport\s*=\s*\{[\s\S]*userScalable:\s*true/.test(layoutTsx),
  "root viewport should explicitly allow user scaling for mobile Safari pinch zoom",
);

console.log("mobile main pinch zoom checks passed.");
