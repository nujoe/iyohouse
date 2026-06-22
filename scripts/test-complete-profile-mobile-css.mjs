import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/09-auth.css", import.meta.url), "utf8");

function getRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "m"));
  assert.ok(match?.groups?.body, `${selector} rule must exist`);
  return match.groups.body;
}

function getRuleByPattern(selectorPattern, label) {
  const match = css.match(new RegExp(`${selectorPattern}\\s*\\{(?<body>[^}]*)\\}`, "m"));
  assert.ok(match?.groups?.body, `${label} rule must exist`);
  return match.groups.body;
}

function assertDeclaration(rule, property, value) {
  assert.match(
    rule,
    new RegExp(`${property}\\s*:\\s*${value}\\s*;`),
    `${property} must be ${value}`,
  );
}

const cardRule = getRule(".complete-profile-card");
assertDeclaration(cardRule, "max-height", "none");
assertDeclaration(cardRule, "overflow", "visible");

const buttonRule = getRuleByPattern(
  "\\.complete-profile-card \\.email-submit-btn,\\s*\\.complete-profile-card \\.complete-profile-logout",
  "complete profile button sizing",
);
assertDeclaration(buttonRule, "min-height", "54px");
assertDeclaration(buttonRule, "font-size", "13px");
assertDeclaration(buttonRule, "line-height", "1\\.25");

console.log("complete profile mobile CSS checks passed.");
