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
    /Object\.keys\(payload\)\.length === 0[\s\S]*?return nicepayOkResponse\(\)/,
    "empty NICEPAY registration probes must receive a 200 OK response",
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
});
