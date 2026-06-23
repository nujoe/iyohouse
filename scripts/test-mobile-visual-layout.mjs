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

function desktopRules(root, selector) {
    const rules = [];

    root.walkAtRules("media", (atRule) => {
        if (!atRule.params.includes("min-width")) {
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

function declarationsFor(root, selector, mode = "mobile") {
    const rules = mode === "desktop" ? desktopRules(root, selector) : mobileRules(root, selector);

    return Object.fromEntries(
        rules.flatMap((rule) =>
            rule.nodes
                .filter((node) => node.type === "decl")
                .map((decl) => [decl.prop, { value: decl.value, important: decl.important }]),
        ),
    );
}

function baseDeclarationsFor(root, selector) {
    const rules = root.nodes.filter(
        (node) => node.type === "rule" && node.selectors?.includes(selector),
    );

    return Object.fromEntries(
        rules.flatMap((rule) =>
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

test("desktop main and member visual stacks keep one grid-gap padding around images", () => {
    const css = parseCss("src/styles/11-member-contact-sidebar.css");
    const mainDeclarations = declarationsFor(css, ".main-visual-column .visual-stack-v2", "desktop");
    expectImportantDeclaration(mainDeclarations, "inset", "calc(var(--line-gap) * 2) calc(var(--line-gap) * 2) var(--line-gap)");
    expectImportantDeclaration(mainDeclarations, "padding", "0");
    expectImportantDeclaration(mainDeclarations, "gap", "var(--line-gap)");

    const memberDeclarations = declarationsFor(css, ".member-visual-aside .visual-stack-v2", "desktop");
    expectImportantDeclaration(memberDeclarations, "inset", "var(--line-gap) calc(var(--line-gap) * 2) var(--line-gap)");
    expectImportantDeclaration(memberDeclarations, "padding", "0");
    expectImportantDeclaration(memberDeclarations, "gap", "var(--line-gap)");
});

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
        expectImportantDeclaration(declarations, "padding", "var(--line-gap) calc(var(--line-gap) * 2) var(--line-gap)");
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

test("mobile app and stage use dynamic viewport height so the bottom grid line stays visible", () => {
    const baseCss = parseCss("src/styles/00-base.css");
    const mobileCss = parseCss("src/styles/12-mobile-scroll-layout.css");
    const baseAppDeclarations = baseDeclarationsFor(baseCss, ".app-container");
    const appDeclarations = declarationsFor(mobileCss, ".app-container");
    const stageDeclarations = declarationsFor(mobileCss, ".stage");

    assert.equal(
        baseAppDeclarations.height?.value,
        "100vh",
        "desktop app container should keep the stable viewport height baseline",
    );
    expectImportantDeclaration(appDeclarations, "height", "100dvh");
    expectImportantDeclaration(stageDeclarations, "height", "100dvh");
});

test("mobile main bottom grid row uses the small viewport height to avoid browser chrome overlap", () => {
    const mobileCss = parseCss("src/styles/12-mobile-scroll-layout.css");
    const mainDeclarations = declarationsFor(mobileCss, ".app-container.preset-main");
    const transitionDeclarations = declarationsFor(mobileCss, ".app-container.grid-preset-main");

    expectImportantDeclaration(mainDeclarations, "--grid-top-row-2", "calc(100svh - var(--line-gap))");
    expectImportantDeclaration(transitionDeclarations, "--grid-top-row-2", "calc(100svh - var(--line-gap))");
});
