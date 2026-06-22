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
  /cancelPendingPaymentRegistration\(registration_id\)/,
  "NICEPAY payment-window errors must cancel the pending registration they created",
);

const catchBlock = overlaySource.match(/catch\s*\(error:[\s\S]*?\n\s*\}\s*finally/);
assert.ok(catchBlock, "payment startup catch block must exist");
assert.match(
  catchBlock[0],
  /pendingRegistrationId/,
  "payment startup failures after registration creation must track the pending registration id",
);
assert.match(
  catchBlock[0],
  /cancelPendingPaymentRegistration\(pendingRegistrationId\)/,
  "payment startup failures must cancel the pending registration before showing the error",
);

const authFailureBlock = confirmRouteSource.match(/if\s*\(auth\.authResultCode !== "0000"\)\s*\{[\s\S]*?\n\s*\}/);
assert.ok(authFailureBlock, "NICEPAY auth failure block must exist");
assert.match(
  authFailureBlock[0],
  /markPendingRegistrationCancelled\(registration\.id,\s*"auth_failed"\)/,
  "NICEPAY auth failures must cancel the pending registration",
);

const approvalFailureBlock = confirmRouteSource.match(/if\s*\(!approval\.ok\)\s*\{[\s\S]*?\n\s*\}/);
assert.ok(approvalFailureBlock, "NICEPAY approval failure block must exist");
assert.match(
  approvalFailureBlock[0],
  /markPendingRegistrationCancelled\(registration\.id,\s*"approval_failed"\)/,
  "NICEPAY approval failures must cancel the pending registration",
);

console.log("payment cancellation cleanup checks passed.");
