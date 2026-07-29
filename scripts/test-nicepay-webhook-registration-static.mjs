import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../src/app/api/payment/webhook/route.ts", import.meta.url),
  "utf8",
);

test("NICEPAY webhook registration probe receives OK without weakening payment validation", () => {
  assert.match(
    route,
    /rawBody\.trim\(\) === ""[\s\S]*?return nicepayOkResponse\(\)/,
    "empty-body NICEPAY registration probes must receive a 200 OK response",
  );
  assert.match(
    route,
    /Object\.keys\(payload\)\.length === 0[\s\S]*?return nicepayOkResponse\(\)/,
    "empty-object NICEPAY registration probes must receive a 200 OK response",
  );
  assert.match(
    route,
    /if \(!orderId \|\| !tid \|\| !amount \|\| !fields\.ediDate \|\| !fields\.signature\)/,
    "non-empty events must still require the payment identity and signature fields",
  );
  assert.match(
    route,
    /if \(!verifyNicepayResultSignature\(fields\)\)/,
    "non-empty events must still verify the NICEPAY signature",
  );
  assert.match(
    route,
    /\.eq\("payment_key",\s*tid\)[\s\S]*?\.eq\("order_id",\s*orderId\)/,
    "real webhook transitions must load the ledger by TID and order",
  );
  assert.match(
    route,
    /confirm_payment_registration/,
    "card and easy-payment paid events must retain generic confirmation",
  );
  assert.match(
    route,
    /if \(status === "cancelled"\)[\s\S]*?if \(payment\)[\s\S]*?await cancelActiveRegistration\(registration\.id\)/,
    "registration cancellation must require the matching payment ledger",
  );
  assert.doesNotMatch(
    route,
    /await cancelPendingRegistration/,
    "no-ledger failure events must not cancel a registration by order alone",
  );
});
