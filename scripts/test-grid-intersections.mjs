import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, ".tmp/grid-intersections-test");

rmSync(outDir, { recursive: true, force: true });

execFileSync(
    "npx",
    [
        "tsc",
        "src/lib/gridIntersections.ts",
        "--outDir",
        outDir,
        "--module",
        "commonjs",
        "--target",
        "ES2022",
        "--skipLibCheck",
        "--esModuleInterop",
    ],
    { cwd: rootDir, stdio: "pipe" },
);

const compiledModule = resolve(outDir, "gridIntersections.js");
assert.equal(existsSync(compiledModule), true, "gridIntersections.ts should compile to JavaScript");

const require = createRequire(import.meta.url);
const {
    GRID_HORIZONTAL_LINES,
    GRID_INTERSECTIONS,
    GRID_VERTICAL_LINES,
    createGridIntersections,
} = require(compiledModule);

assert.equal(GRID_VERTICAL_LINES.length, 3, "frame should expose left, right, and center vertical lines");
assert.equal(GRID_HORIZONTAL_LINES.length, 2, "frame should expose top and bottom horizontal lines");
assert.equal(GRID_INTERSECTIONS.length, 6, "three vertical lines crossing two horizontal lines should create six markers");

assert.deepEqual(
    GRID_INTERSECTIONS.map((intersection) => intersection.id),
    [
        "left-top",
        "left-bottom",
        "right-top",
        "right-bottom",
        "center-top",
        "center-bottom",
    ],
);

for (const intersection of GRID_INTERSECTIONS) {
    assert.match(intersection.className, /grid-intersection-marker/);
    assert.equal(intersection.left.startsWith("var(--grid-line-x-"), true);
    assert.equal(intersection.top.startsWith("var(--"), true);
}

assert.equal(
    GRID_INTERSECTIONS.find((intersection) => intersection.id === "center-top")?.className.includes("grid-intersection-marker-center"),
    true,
    "center intersections should have a class that can hide with the center line",
);

assert.deepEqual(
    createGridIntersections(
        [{ id: "a", left: "1px" }],
        [{ id: "b", top: "2px" }],
    ),
    [
        {
            id: "a-b",
            className: "grid-intersection-marker grid-intersection-marker-a grid-intersection-marker-b",
            left: "1px",
            top: "2px",
        },
    ],
);

rmSync(outDir, { recursive: true, force: true });
