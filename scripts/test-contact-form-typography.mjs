import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";

const rootDir = resolve(import.meta.dirname, "..");
const css = postcss.parse(
  readFileSync(resolve(rootDir, "src/styles/11-member-contact-sidebar.css"), "utf8"),
  { from: "src/styles/11-member-contact-sidebar.css" },
);

function declarationsFor(selector) {
  const rule = css.nodes.find(
    (node) => node.type === "rule" && node.selectors?.includes(selector),
  );
  assert.ok(rule, `${selector} rule should exist`);

  return Object.fromEntries(
    rule.nodes
      .filter((node) => node.type === "decl")
      .map((decl) => [decl.prop, decl.value]),
  );
}

const contactContent = declarationsFor(".contact-sidebar-content");
const title = declarationsFor(".contact-sidebar-header .modal-title");
const input = declarationsFor(".contact-sidebar-content .form-input-classic");
const textarea = declarationsFor(".contact-sidebar-content .form-textarea-classic");
const submit = declarationsFor(".contact-sidebar-content .form-submit-btn-classic");

assert.equal(
  contactContent["font-family"],
  "var(--font-gowun-batang), 'Gowun Batang', var(--font-noto-serif), serif",
  "contact form content should use Gowun Batang",
);
assert.equal(input["font-family"], "inherit", "contact inputs should inherit the contact font");
assert.equal(textarea["font-family"], "inherit", "contact textarea should inherit the contact font");
assert.equal(submit["font-family"], "inherit", "submit button should inherit the contact font");
assert.equal(submit["font-size"], "1.3rem", "submit button should keep the requested base size");
assert.equal(
  title["font-size"],
  submit["font-size"],
  "contact title should match the submit button font size",
);

console.log("contact form typography checks passed.");
