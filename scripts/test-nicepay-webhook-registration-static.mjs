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
    /application\/x-www-form-urlencoded[\s\S]*?URLSearchParams/,
    "NICEPAY URL notifications must parse form-urlencoded bodies",
  );
  assert.match(
    route,
    /MOID[\s\S]*?TID[\s\S]*?Amt[\s\S]*?ResultCode/,
    "NICEPAY notification field aliases must be supported",
  );
  assert.match(
    route,
    /resultCode === "4110"/,
    "NICEPAY virtual-account deposit notifications must accept ResultCode 4110",
  );
  assert.match(
    route,
    /if \(\s*!tid\s*\)[\s\S]*?return nicepayOkResponse\(\)/,
    "registration probes without a transaction TID must receive OK without entering payment processing",
  );
  assert.match(
    route,
    /rawBody\.trim\(\) === ""[\s\S]*?return nicepayOkResponse\(\)/,
    "empty-body NICEPAY registration probes must receive a 200 OK response",
  );
  assert.match(
    route,
    /probe=nicepay|probe.*nicepay[\s\S]*?return nicepayOkResponse\(\)/,
    "NICEPAY probe=nicepay registration checks must receive OK even when mislabeled as JSON",
  );
  assert.match(
    route,
    /Object\.keys\(payload\)\.length === 0[\s\S]*?return nicepayOkResponse\(\)/,
    "empty-object NICEPAY registration probes must receive a 200 OK response",
  );
  assert.match(
    route,
    /Content-Type.*text\/html/,
    "NICEPAY webhook responses must use the text/html content type",
  );
  assert.match(
    route,
    /NICEPAY webhook rejected[\s\S]*?requestId[\s\S]*?reason/,
    "NICEPAY webhook rejections must log a request id and a safe failure reason",
  );
  assert.match(
    route,
    /X-Nicepay-Request-Id/,
    "NICEPAY webhook rejection responses must expose the diagnostic request id",
  );
  assert.match(
    route,
    /if \(!orderId \|\| !tid \|\| !amount\)/,
    "non-empty events must still require the payment identity fields",
  );
  assert.match(
    route,
    /if \(!isFormPayload && !verifyNicepayResultSignature\(signatureFields\)\)/,
    "JSON callback events must still verify the NICEPAY signature",
  );
  assert.match(
    route,
    /\.eq\("order_id",\s*orderId\)[\s\S]*?if \(!registration\)[\s\S]*?return nicepayOkResponse\(\)[\s\S]*?verifyNicepayResultSignature\(signatureFields\)/,
    "NICEPAY registration samples without an internal order must receive OK before signature validation",
  );
  assert.match(
    route,
    /signatureFields[\s\S]*?firstField\(fields, \["ediDate"/,
    "signature verification must normalize NICEPAY field aliases",
  );
  assert.match(
    route,
    /\.eq\("payment_key",\s*tid\)[\s\S]*?\.eq\("order_id",\s*orderId\)/,
    "real webhook transitions must load the ledger by TID and order",
  );
  assert.match(
    route,
    /reconcile_payment_registration/,
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
  assert.match(
    route,
    /const cancellation = await cancelActiveRegistration\(registration\.id\)/,
    "card cancellation must inspect the update outcome",
  );
  assert.match(
    route,
    /if \(!cancellation\.ok\)[\s\S]*?status:\s*500/,
    "a card cancellation storage error must remain retryable",
  );
  assert.match(
    route,
    /canAcknowledgeNicepayCardCancellation/,
    "card cancellation must acknowledge only a completed transition",
  );
});
