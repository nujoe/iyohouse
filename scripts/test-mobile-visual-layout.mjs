import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import postcss from "postcss";

const rootDir = resolve(import.meta.dirname, "..");

function parseCss(path) {
    return postcss.parse(readFileSync(resolve(rootDir, path), "utf8"), { from: path });
}

function mobileRules(root, selector) {
    const rules = [];

    root.walkAtRules("media", (atRule) => {
        if (!atRule.params.includes("max-width")) {
            return;
        }

        atRule.walkRules((rule) => {
            if (rule.selectors?.includes(selector)) {
                rules.push(rule);
            }
        });
    });

    return rules;
}

function declarationsFor(root, selector) {
    return Object.fromEntries(
        mobileRules(root, selector).flatMap((rule) =>
            rule.nodes
                .filter((node) => node.type === "decl")
                .map((decl) => [decl.prop, { value: decl.value, important: decl.important }]),
        ),
    );
}

function expectImportantDeclaration(declarations, property, value) {
    assert.deepEqual(
        declarations[property],
        { value, important: true },
        `${property} should be ${value} !important`,
    );
}

test("mobile main and member visual stacks use grid-gap spacing with original image ratio", () => {
    const css = parseCss("src/styles/11-member-contact-sidebar.css");
    const stackSelectors = [
        ".main-visual-column .visual-stack-v2",
        ".member-visual-aside .visual-stack-v2",
    ];
    const boxSelectors = [
        ".main-visual-column .v-box-v2",
        ".member-visual-aside .v-box-v2",
    ];
    const imageSelectors = [
        ".main-visual-column .v-box-v2 img",
        ".member-visual-aside .v-box-v2 img",
    ];

    for (const selector of stackSelectors) {
        const declarations = declarationsFor(css, selector);
        expectImportantDeclaration(declarations, "padding", "0 var(--line-gap) var(--line-gap) var(--line-gap)");
        expectImportantDeclaration(declarations, "gap", "var(--line-gap)");
        expectImportantDeclaration(declarations, "height", "auto");
        expectImportantDeclaration(declarations, "overflow-y", "visible");
    }

    for (const selector of boxSelectors) {
        const declarations = declarationsFor(css, selector);
        expectImportantDeclaration(declarations, "border", "0");
        expectImportantDeclaration(declarations, "height", "auto");
        expectImportantDeclaration(declarations, "flex", "0 0 auto");
    }

    for (const selector of imageSelectors) {
        const declarations = declarationsFor(css, selector);
        expectImportantDeclaration(declarations, "width", "100%");
        expectImportantDeclaration(declarations, "height", "auto");
    }
});

test("mobile pola image can scale down inside the main text column", () => {
    const css = parseCss("src/styles/03-home.css");
    const wrapperDeclarations = declarationsFor(css, ".main-pola-wrapper");
    const imageDeclarations = declarationsFor(css, ".main-pola-img");

    assert.equal(
        wrapperDeclarations.padding?.value,
        "16px var(--line-gap) 8px 0",
        "mobile pola wrapper should move the image closer to the right grid edge",
    );
    assert.equal(
        imageDeclarations["max-width"]?.value,
        "min(180px, 56vw)",
        "mobile pola image should cap below the desktop size",
    );
    assert.equal(
        imageDeclarations["max-width"]?.important,
        true,
        "mobile pola image max-width should override the desktop rule",
    );
});
