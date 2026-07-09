import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(
  new URL("../src/styles/11-member-contact-sidebar.css", import.meta.url),
  "utf8",
);
const memberView = await readFile(
  new URL("../src/components/MemberView.tsx", import.meta.url),
  "utf8",
);

const cardName = css.match(/\.card-name\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
assert.match(cardName, /border-bottom:\s*5px solid var\(--intersect\)/);
assert.match(cardName, /padding:\s*0 0 4px 10px/);
assert.doesNotMatch(cardName, /background-image:/);

const contactTitle =
  css.match(/\.contact-sidebar-header \.modal-title\s*\{(?<body>[^}]*)\}/)?.groups
    ?.body ?? "";
assert.match(contactTitle, /font-size:\s*1\.6rem/);

assert.doesNotMatch(memberView, /getMemberColorHex/);
assert.doesNotMatch(memberView, /backgroundImage:/);

console.log("member name and contact title styles are stable");
