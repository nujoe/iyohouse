import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlaySource = readFileSync(
  new URL("../src/components/workshop/WorkshopDetailOverlay.tsx", import.meta.url),
  "utf8",
);
const confirmRouteSource = readFileSync(
  new URL("../src/app/api/payment/confirm/route.ts", import.meta.url),
  "utf8",
);

assert.match(
  overlaySource,
  /cancelPendingPaymentRegistration/,
  "workshop payment UI must expose a helper that cancels a pending registration",
);

const nicepayErrorBlock = overlaySource.match(/fnError:\s*\(result:[\s\S]*?\n\s*\},/);
assert.ok(nicepayErrorBlock, "NICEPAY fnError handler must exist");
assert.match(
  nicepayErrorBlock[0],
  /cancelPendingPaymentRegistration\(registration_id,\s*checkoutAttemptId\)/,
  "NICEPAY payment-window errors must cancel the matching VBank checkout attempt",
);

const paymentStartupSource = overlaySource.slice(
  overlaySource.indexOf("const startWorkshopPayment"),
);
const catchBlock = paymentStartupSource.match(/catch\s*\(error:[\s\S]*?\n\s*\}\s*finally/);
assert.ok(catchBlock, "payment startup catch block must exist");
assert.match(
  catchBlock[0],
  /pendingRegistrationId/,
  "payment startup failures after registration creation must track the pending registration id",
);
assert.match(
  catchBlock[0],
  /cancelPendingPaymentRegistration\(pendingRegistrationId,\s*checkoutAttemptId\)/,
  "payment startup failures must cancel the matching VBank checkout attempt before showing the error",
);

assert.match(
  overlaySource,
  /checkoutAttemptId = selectedMethod === "vbank"[\s\S]*?: null;/,
  "card checkout must leave the optional VBank attempt ID unset",
);
assert.match(
  overlaySource,
  /checkoutAttemptId \? \{ checkout_attempt_id: checkoutAttemptId \} : \{\}/,
  "card cleanup must remain a registration-only request",
);

const registrationCheckBlock = overlaySource.match(/const checkRegistration = async \(\) => \{[\s\S]*?\n\s*\};/);
assert.ok(registrationCheckBlock, "workshop detail must check whether the current user has applied");
assert.match(
  registrationCheckBlock[0],
  /\.eq\('status',\s*'confirmed'\)/,
  "the already-applied UI must only lock confirmed registrations",
);
assert.doesNotMatch(
  registrationCheckBlock[0],
  /\.in\('status',\s*\[\s*'pending',\s*'confirmed'\s*\]\)/,
  "pending payment holds must not show as already applied after payment cancellation",
);

const authFailureBlock = confirmRouteSource.match(/if\s*\(auth\.authResultCode !== "0000"\)\s*\{[\s\S]*?\n\s*\}/);
assert.ok(authFailureBlock, "NICEPAY auth failure block must exist");
assert.match(
  authFailureBlock[0],
  /releaseVirtualAccountCheckout\(\s*registration,\s*checkoutAttemptId,\s*"auth_failed",/,
  "NICEPAY auth failures must release the matching checkout attempt",
);

const approvalFailureBlock = confirmRouteSource.match(/if\s*\(!approval\.ok\)\s*\{[\s\S]*?\n\s*\}/);
assert.ok(approvalFailureBlock, "NICEPAY approval failure block must exist");
assert.match(
  approvalFailureBlock[0],
  /releaseVirtualAccountCheckout\(\s*registration,\s*checkoutAttemptId,\s*"approval_failed",/,
  "NICEPAY approval failures must release the matching checkout attempt",
);

console.log("payment cancellation cleanup checks passed.");
