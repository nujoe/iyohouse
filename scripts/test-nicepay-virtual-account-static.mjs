import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const nicepay = readFileSync(join(root, "src/lib/payment/nicepay.ts"), "utf8");
const checkout = readFileSync(join(root, "src/app/api/payment/checkout/route.ts"), "utf8");
const outputDir = mkdtempSync(join(tmpdir(), "iyohouse-nicepay-test-"));

try {
  execFileSync(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "--target", "ES2022",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--outDir", outputDir,
    "--skipLibCheck",
    join(root, "src/lib/payment/nicepay.ts"),
  ]);
} catch (error) {
  rmSync(outputDir, { recursive: true, force: true });
  throw error;
}

const nicepayModule = await import(pathToFileURL(join(outputDir, "nicepay.js")).href);

test.after(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

const registration = {
  id: "registration-1",
  order_id: "order-1",
  amount: 10000,
  snapshot_name: "IYOHOUSE",
  snapshot_email: "payment@example.com",
};

function withNicepayEnv(values, callback) {
  const names = [
    "IYO_NICEPAY_METHOD",
    "IYO_NICEPAY_METHODS",
    "IYO_NICEPAY_VBANK_ENABLED",
    "IYO_NICEPAY_VBANK_VALID_HOURS",
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));

  try {
    for (const name of names) {
      if (Object.hasOwn(values, name) && values[name] !== undefined) {
        process.env[name] = values[name];
      } else {
        delete process.env[name];
      }
    }

    return callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

function createPayload(method) {
  return createPayloadWithMethodInput(method === undefined ? {} : { method });
}

function createPayloadWithMethodInput(methodInput) {
  return nicepayModule.createNicepayPaymentPayload({
    registration,
    userId: "user-1",
    orderName: "IYOHOUSE Workshop",
    origin: "https://iyohouse.example",
    ...methodInput,
  });
}

test("NICEPAY virtual-account checkout contract is defined", () => {
  assert.match(nicepay, /cardAndEasyPay/, "must support the NICEPAY card/easy request method");
  assert.match(nicepay, /IYO_NICEPAY_VBANK_ENABLED/, "must gate vbank until webhook rollout");
  assert.match(nicepay, /IYO_NICEPAY_VBANK_VALID_HOURS/, "must configure vbank expiry in hours");
  assert.match(nicepay, /getNicepayAvailableCheckoutMethods/, "must expose non-secret method availability");
  assert.match(nicepay, /getNicepayVirtualAccount/, "must extract issued virtual account data");
});

test("vbank is unavailable by default", () => {
  withNicepayEnv({ IYO_NICEPAY_METHODS: "cardAndEasyPay,vbank" }, () => {
    assert.deepEqual(nicepayModule.getNicepayAvailableCheckoutMethods(), {
      cardAndEasyPay: true,
      vbank: false,
    });
  });
});

test("invalid vbank validity hours use the three-hour fallback", () => {
  withNicepayEnv({
    IYO_NICEPAY_METHODS: "vbank",
    IYO_NICEPAY_VBANK_ENABLED: "true",
    IYO_NICEPAY_VBANK_VALID_HOURS: "invalid",
  }, () => {
    assert.equal(createPayload("vbank").vbankValidHours, 3);
  });
});

test("virtual-account extraction rejects missing, top-level, and malformed values", () => {
  assert.equal(nicepayModule.getNicepayVirtualAccount({}), null);
  assert.equal(nicepayModule.getNicepayVirtualAccount({ code: "004" }), null);
  assert.equal(nicepayModule.getNicepayVirtualAccount({
    vbank: {
      code: "004",
      name: "KB",
      number: "1234567890",
      holder: "IYOHOUSE",
      expiresAt: "not-an-iso-date",
    },
  }), null);
  assert.deepEqual(nicepayModule.getNicepayVirtualAccount({
    vbank: {
      code: "004",
      name: "KB",
      number: "1234567890",
      holder: "IYOHOUSE",
      expiresAt: "2026-07-29T12:00:00Z",
    },
  }), {
    code: "004",
    name: "KB",
    number: "1234567890",
    holder: "IYOHOUSE",
    expiresAt: "2026-07-29T12:00:00Z",
  });
});

test("explicit empty and null methods are rejected", () => {
  withNicepayEnv({ IYO_NICEPAY_METHODS: "cardAndEasyPay" }, () => {
    assert.throws(() => createPayload(""), /Requested NICEPAY checkout method is not configured/);
    assert.throws(() => createPayload(null), /Requested NICEPAY checkout method is not configured/);
  });
});

test("checkout request method input preserves omitted and explicit values", () => {
  assert.match(
    checkout,
    /nicepayCheckoutMethodInput\(checkoutRequest\)/,
    "checkout must preserve request method property presence",
  );

  withNicepayEnv({ IYO_NICEPAY_METHOD: "card" }, () => {
    const omitted = nicepayModule.nicepayCheckoutMethodInput({});
    assert.deepEqual(omitted, {});
    assert.equal(createPayloadWithMethodInput(omitted).method, "card");

    for (const method of [undefined, null, ""]) {
      const explicit = nicepayModule.nicepayCheckoutMethodInput({ method });
      assert.equal(Object.hasOwn(explicit, "method"), true);
      assert.throws(
        () => createPayloadWithMethodInput(explicit),
        /Requested NICEPAY checkout method is not configured/,
      );
    }
  });
});

test("a disabled vbank default is rejected", () => {
  withNicepayEnv({ IYO_NICEPAY_METHOD: "vbank", IYO_NICEPAY_VBANK_ENABLED: "false" }, () => {
    assert.throws(() => createPayload(), /NICEPAY virtual-account checkout is disabled/);
  });
});

test("virtual-account database lifecycle uses locked service-role RPCs", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/20260729000001_add_virtual_account_payment_lifecycle.sql"),
    "utf8",
  );

  assert.match(sql, /ADD COLUMN IF NOT EXISTS provider_status TEXT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS vbank_number TEXT/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reserve_virtual_account_registration/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_virtual_account_issuance/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.confirm_virtual_account_deposit/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fail_virtual_account_payment/);
  assert.match(sql, /FOR UPDATE/, "payment lifecycle functions must lock their registration");
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.confirm_virtual_account_deposit[\s\S]+TO service_role/);
});
