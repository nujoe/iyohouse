import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const privacyPageUrl = new URL("../src/app/privacy/page.tsx", import.meta.url);
assert.ok(existsSync(privacyPageUrl), "privacy policy page should exist at /privacy");

const privacySource = readFileSync(privacyPageUrl, "utf8");
for (const requiredText of [
  "개인정보처리방침",
  "Google",
  "이메일",
  "프로필",
  "워크숍",
  "Supabase",
  "NicePay",
  "goyangiyoram@gmail.com",
]) {
  assert.ok(
    privacySource.includes(requiredText),
    `/privacy should include ${requiredText}`,
  );
}
assert.ok(
  privacySource.includes('height: "100vh"'),
  "/privacy should own a viewport-height scroll container because global body scrolling is locked",
);
assert.ok(
  privacySource.includes('overflowY: "auto"'),
  "/privacy should allow vertical scrolling inside the page",
);
assert.ok(
  privacySource.includes('href="/?preset=main"'),
  "/privacy should include a top-left back link to the main page",
);
assert.ok(
  privacySource.includes("styles.backButton"),
  "/privacy should style the back link as a dedicated button",
);
assert.ok(
  privacySource.indexOf("개인정보처리방침") < privacySource.indexOf("Privacy Policy"),
  "Privacy Policy label should appear after the main title in the page structure",
);
assert.ok(
  privacySource.indexOf("문의") < privacySource.indexOf("시행일 및 최종 업데이트"),
  "updated date should appear at the bottom after the policy content",
);

const infoButtonSource = readFileSync(
  new URL("../src/components/home/HomeInfoButton.tsx", import.meta.url),
  "utf8",
);

assert.ok(
  infoButtonSource.includes('href="/privacy"'),
  "homepage info overlay should link to the privacy policy",
);
assert.ok(
  infoButtonSource.indexOf('href="/privacy"') < infoButtonSource.indexOf("{t.footer.address}"),
  "privacy policy link should appear above the address in the info overlay",
);

console.log("privacy policy checks passed.");
