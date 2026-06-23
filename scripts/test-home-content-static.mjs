import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const translations = readFileSync(
  new URL("../src/lib/i18n/translations.ts", import.meta.url),
  "utf8",
);
const chatbotConfig = readFileSync(
  new URL("../src/features/iyohouse-chatbot/config.ts", import.meta.url),
  "utf8",
);
const visualStack = readFileSync(
  new URL("../src/components/MemberVisualStack.tsx", import.meta.url),
  "utf8",
);
const homeCss = readFileSync(new URL("../src/styles/03-home.css", import.meta.url), "utf8");

assert.ok(
  chatbotConfig.includes("enabled: false"),
  "chatbot should be hidden on every screen",
);

assert.ok(
  translations.includes('mainIntroTitle: "〈이요하우스〉"'),
  "Korean main title should use angle brackets",
);
assert.ok(
  translations.includes('mainIntroTitle: "〈IYOHOUSE〉"'),
  "English main title should use angle brackets",
);

assert.ok(
  translations.includes('title: "Contact"'),
  "contact form title should be Contact",
);
assert.ok(
  !translations.includes("재미있는 작업을 구상중이신가요?"),
  "old contact copy should be removed",
);
assert.ok(
  !translations.includes("IYOHOUSE is open to new connections"),
  "old English contact copy should be removed",
);

for (const imagePath of ["/member/2.JPG", "/member/3.JPG", "/member/4.JPG"]) {
  assert.ok(visualStack.includes(imagePath), `visual stack should use ${imagePath}`);
}
for (const oldPath of ["/member/member_2.png", "/member/member_3.png", "/member/member_4.png"]) {
  assert.ok(!visualStack.includes(oldPath), `visual stack should not use ${oldPath}`);
}

assert.ok(
  !/main-intro-text[\s\S]*margin-top:\s*10px;/.test(homeCss),
  "main intro text should keep its original title-to-text spacing",
);
assert.ok(
  /main-intro-title[\s\S]*padding:\s*35px 20px 15px calc\(var\(--line-gap\) \+ 24px\);/.test(homeCss),
  "main intro title should have a little more top padding",
);
assert.ok(
  /main-intro-title[\s\S]*font-size:\s*2\.25rem;/.test(homeCss),
  "main intro title should be slightly larger",
);

console.log("home content checks passed.");
