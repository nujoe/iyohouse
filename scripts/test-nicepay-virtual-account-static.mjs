import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const nicepay = readFileSync(join(process.cwd(), "src/lib/payment/nicepay.ts"), "utf8");

test("NICEPAY virtual-account checkout contract is defined", () => {
  assert.match(nicepay, /cardAndEasyPay/, "must support the NICEPAY card/easy request method");
  assert.match(nicepay, /IYO_NICEPAY_VBANK_ENABLED/, "must gate vbank until webhook rollout");
  assert.match(nicepay, /IYO_NICEPAY_VBANK_VALID_HOURS/, "must configure vbank expiry in hours");
  assert.match(nicepay, /getNicepayAvailableCheckoutMethods/, "must expose non-secret method availability");
  assert.match(nicepay, /getNicepayVirtualAccount/, "must extract issued virtual account data");
});

test("explicit NICEPAY checkout methods are rejected when not configured", () => {
  assert.match(
    nicepay,
    /if \(method\) \{[\s\S]*?getRequestedCheckoutMethod\(method\)[\s\S]*?config\.methods\.includes\(requestedMethod\)[\s\S]*?throw new Error/,
    "must explicitly reject an unsupported requested method",
  );
  assert.doesNotMatch(
    nicepay,
    /if \(!config\.methods\.includes\(selectedMethod\)\) \{\s*selectedMethod = config\.method;/,
    "must not silently replace a rejected requested method with the default",
  );
});
