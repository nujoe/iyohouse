import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";

const rootDir = resolve(import.meta.dirname, "..");

function parseCss(path) {
  return postcss.parse(readFileSync(resolve(rootDir, path), "utf8"), { from: path });
}

function mediaRules(root, mediaQueryPart) {
  const rules = root.nodes.filter(
    (node) => node.type === "atrule"
      && node.name === "media"
      && node.params.includes(mediaQueryPart),
  );
  assert.ok(rules.length > 0, `@media ${mediaQueryPart} should exist`);
  return rules;
}

function declarationsFor(atRules, selector) {
  for (const atRule of atRules) {
    const rule = atRule.nodes.find(
      (node) => node.type === "rule" && node.selectors?.includes(selector),
    );

    if (rule) {
      return Object.fromEntries(
        rule.nodes
          .filter((node) => node.type === "decl")
          .map((decl) => [decl.prop, { value: decl.value, important: decl.important }]),
      );
    }
  }

  assert.fail(`${selector} rule should exist in ${atRules.map((rule) => rule.params).join(", ")}`);
}

function expectDisplayNone(atRules, selector) {
  assert.deepEqual(
    declarationsFor(atRules, selector).display,
    { value: "none", important: true },
    `${selector} should be display: none !important`,
  );
}

const workshopCss = parseCss("src/styles/06-workshop-calendar.css");
const mobileCss = parseCss("src/styles/12-mobile-scroll-layout.css");
const workshopGridSource = readFileSync(
  resolve(rootDir, "src/components/WorkshopGrid.tsx"),
  "utf8",
);
const workshopMobile = mediaRules(workshopCss, "max-width: 800px");
const mobileLayout = mediaRules(mobileCss, "max-width: 768px");

for (const selector of [
  ".workshop-item:nth-child(2n)::after",
  ".workshop-item:nth-child(2n) .intersection-diamond",
  ".workshop-item:last-child:nth-child(2n+1)::before",
  ".workshop-item:last-child:nth-child(2n+1) .intersection-diamond",
  ".workshop-item:nth-child(2n+1):nth-last-child(2)::before",
  ".workshop-item:nth-child(2n+1):nth-last-child(2) .intersection-diamond",
  ".workshop-item:nth-child(2n+1):nth-last-child(2) + .workshop-item::before",
  ".workshop-item:nth-child(2n+1):nth-last-child(2) + .workshop-item .intersection-diamond",
  ".workshop-item.is-mobile-row-end::after",
  ".workshop-item.is-mobile-row-end .intersection-diamond",
  ".workshop-item.is-mobile-last-row::before",
  ".workshop-item.is-mobile-last-row .intersection-diamond",
]) {
  expectDisplayNone(workshopMobile, selector);
}

for (const selector of [
  ".preset-workshop .grid-intersection-marker-left",
  ".preset-workshop .grid-intersection-marker-right",
  ".preset-workshop .grid-intersection-marker-bottom",
  ".grid-preset-workshop .grid-intersection-marker-left",
  ".grid-preset-workshop .grid-intersection-marker-right",
  ".grid-preset-workshop .grid-intersection-marker-bottom",
]) {
  const declarations = declarationsFor(mobileLayout, selector);
  assert.deepEqual(
    declarations.opacity,
    { value: "0", important: true },
    `${selector} should be hidden on mobile workshop edges`,
  );
  assert.deepEqual(
    declarations.visibility,
    { value: "hidden", important: true },
    `${selector} should not reserve visible edge markers`,
  );
}

for (const selector of [
  ".preset-workshop .workshop-item[data-mobile-row-end=\"true\"]::after",
  ".preset-workshop .workshop-item[data-mobile-row-end=\"true\"] .intersection-diamond",
  ".preset-workshop .workshop-item[data-mobile-last-row=\"true\"]::before",
  ".preset-workshop .workshop-item[data-mobile-last-row=\"true\"] .intersection-diamond",
  ".app-container.preset-workshop .workshop-grid .workshop-item[data-mobile-row-end=\"true\"]::after",
  ".app-container.preset-workshop .workshop-grid .workshop-item[data-mobile-row-end=\"true\"] > .intersection-diamond",
  ".app-container.preset-workshop .workshop-grid .workshop-item[data-mobile-last-row=\"true\"]::before",
  ".app-container.preset-workshop .workshop-grid .workshop-item[data-mobile-last-row=\"true\"] > .intersection-diamond",
]) {
  expectDisplayNone(mobileLayout, selector);
}

for (const needle of [
  "visibleWorkshops",
  "isMobileRowEnd",
  "isMobileLastRow",
  "is-mobile-row-end",
  "is-mobile-last-row",
  "data-mobile-row-end",
  "data-mobile-last-row",
]) {
  assert.ok(
    workshopGridSource.includes(needle),
    `WorkshopGrid should include ${needle} for deterministic mobile marker classes`,
  );
}

console.log("workshop mobile grid marker checks passed.");
