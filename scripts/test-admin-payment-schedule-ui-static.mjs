import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminSource = readFileSync(
  new URL("../src/lib/admin/workshopAdmin.ts", import.meta.url),
  "utf8",
);
const authCss = readFileSync(new URL("../src/styles/09-auth.css", import.meta.url), "utf8");
const overlayCss = readFileSync(new URL("../src/styles/10-overlays-responsive.css", import.meta.url), "utf8");

assert.ok(
  adminSource.includes('const ADMIN_TIME_ZONE = "Asia/Seoul"'),
  "admin date formatting should define the Korea time zone",
);
assert.ok(
  /formatAdminDateTime[\s\S]*timeZone:\s*ADMIN_TIME_ZONE/.test(adminSource),
  "admin applicant timestamps should be formatted in Korea time",
);

assert.ok(
  /\.payment-success-card\s*\{[\s\S]*font-family:\s*var\(--font-gowun-batang\), 'Gowun Batang'/.test(authCss),
  "payment success modal should use Gowun Batang",
);

assert.ok(
  /\.action-btn\.outline-btn\.selected\s*\{[\s\S]*background:\s*#fff;[\s\S]*color:\s*#000;[\s\S]*border-color:\s*#000;[\s\S]*\}/.test(overlayCss),
  "selected schedule button should keep the outline button style",
);
assert.ok(
  !/\.action-btn\.outline-btn\.selected\s*\{[\s\S]*background:\s*#000;/.test(overlayCss),
  "selected schedule button should not switch to a black fill",
);

console.log("admin payment schedule UI checks passed.");
