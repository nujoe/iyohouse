import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/components/MemberVisualStack.tsx", import.meta.url),
  "utf8",
);

const expectedOrder = [
  "/member/3.JPG",
  "/member/2.JPG",
  "/member/4.JPG",
  "/member/5.jpg",
  "/member/6.JPG",
  "/member/7.jpeg",
  "/member/8.jpeg",
  "/member/9.jpeg",
];

let previousIndex = -1;
for (const path of expectedOrder) {
  const currentIndex = source.indexOf(path);
  assert.ok(currentIndex > previousIndex, `${path} should appear in the requested order`);
  previousIndex = currentIndex;
}

assert.ok(!source.includes("/member/member_2.png"), "old member_2 image should not be used");
assert.ok(!source.includes("/member/member_3.png"), "old member_3 image should not be used");
assert.ok(!source.includes("/member/member_4.png"), "old member_4 image should not be used");

console.log("member visual image checks passed.");
