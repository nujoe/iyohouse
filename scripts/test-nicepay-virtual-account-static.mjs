import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const nicepay = readFileSync(join(root, "src/lib/payment/nicepay.ts"), "utf8");
const checkout = readFileSync(join(root, "src/app/api/payment/checkout/route.ts"), "utf8");
const confirm = readFileSync(join(root, "src/app/api/payment/confirm/route.ts"), "utf8");
const webhook = readFileSync(join(root, "src/app/api/payment/webhook/route.ts"), "utf8");
const fail = readFileSync(join(root, "src/app/api/payment/fail/route.ts"), "utf8");
const readRoute = (relativePath) => {
  const routePath = join(root, relativePath);

  return existsSync(routePath) ? readFileSync(routePath, "utf8") : "";
};
const methods = readRoute("src/app/api/payment/methods/route.ts");
const pending = readRoute("src/app/api/payment/pending/route.ts");
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

test("virtual-account routes use the lifecycle RPCs and owner-scoped status", () => {
  assert.match(checkout, /reserve_virtual_account_registration/);
  assert.match(confirm, /record_virtual_account_issuance/);
  assert.match(confirm, /payment\/pending/);
  assert.match(webhook, /confirm_virtual_account_deposit/);
  assert.match(webhook, /fail_virtual_account_payment/);
  assert.match(methods, /getNicepayAvailableCheckoutMethods/);
  assert.match(pending, /user_id/);

  assert.match(
    checkout,
    /p_registration_id:\s*registration\.id[\s\S]*?p_user_id:\s*user\.id[\s\S]*?p_expires_at:/,
    "vbank reservation must use the exact owner-scoped RPC arguments",
  );
  assert.match(
    pending,
    /\.eq\("order_id",\s*orderId\)[\s\S]*?\.eq\("user_id",\s*user\.id\)/,
    "pending details must query the registration by both order and owner",
  );
  assert.match(
    pending,
    /\.from\("payments"\)[\s\S]*?\.eq\("registration_id",\s*registration\.id\)/,
    "pending details must load only the owner's registration ledger",
  );
  assert.match(
    confirm,
    /paymentMethod\s*===\s*"가상계좌"[\s\S]*?approval\.providerStatus\s*===\s*"ready"/,
    "issuance must require the final NICEPAY method and ready state",
  );
  assert.match(
    webhook,
    /\.eq\("payment_key",\s*tid\)[\s\S]*?\.eq\("order_id",\s*orderId\)/,
    "webhook ledger transitions must be scoped by TID and order",
  );
});

test("an active virtual-account ledger blocks repeat checkout and survives issuance conflicts", () => {
  assert.equal(
    typeof nicepayModule.isPendingReadyVirtualAccountPayment,
    "function",
    "must expose a behavioral active-ledger check",
  );
  assert.equal(
    typeof nicepayModule.shouldCancelRegistrationAfterIssuanceConflict,
    "function",
    "must expose a behavioral issuance-conflict decision",
  );

  const activePayment = {
    registration_id: "registration-1",
    payment_key: "tid-existing",
    order_id: "order-1",
    amount: 10000,
    payment_method: "가상계좌",
    status: "pending",
    provider_status: "ready",
    expires_at: "2026-07-29T15:00:00Z",
  };
  const expected = {
    registrationId: "registration-1",
    orderId: "order-1",
    amount: 10000,
  };
  const now = Date.parse("2026-07-29T12:00:00Z");

  assert.equal(
    nicepayModule.isPendingReadyVirtualAccountPayment(activePayment, expected, now),
    true,
  );
  assert.equal(
    nicepayModule.isPendingReadyVirtualAccountPayment(
      { ...activePayment, provider_status: "paid" },
      expected,
      now,
    ),
    false,
  );
  assert.equal(
    nicepayModule.isPendingReadyVirtualAccountPayment(
      { ...activePayment, expires_at: "2026-07-29T11:59:59Z" },
      expected,
      now,
    ),
    false,
  );
  for (const mismatch of [
    { registration_id: "registration-2" },
    { order_id: "order-2" },
    { amount: 10001 },
  ]) {
    assert.equal(
      nicepayModule.isPendingReadyVirtualAccountPayment(
        { ...activePayment, ...mismatch },
        expected,
        now,
      ),
      false,
      "an unrelated ledger must not block checkout",
    );
  }
  assert.equal(
    nicepayModule.shouldCancelRegistrationAfterIssuanceConflict({
      activePaymentFound: true,
      lookupSucceeded: true,
      compensationSucceeded: true,
    }),
    false,
    "a valid prior ledger must keep the registration pending",
  );
  assert.equal(
    nicepayModule.shouldCancelRegistrationAfterIssuanceConflict({
      activePaymentFound: false,
      lookupSucceeded: true,
      compensationSucceeded: true,
    }),
    true,
    "a compensated issuance with no prior ledger may cancel the registration",
  );
  assert.equal(
    nicepayModule.shouldCancelRegistrationAfterIssuanceConflict({
      activePaymentFound: false,
      lookupSucceeded: false,
      compensationSucceeded: true,
    }),
    false,
    "an uncertain ledger lookup must not cancel the registration",
  );

  const activeCheckIndex = checkout.indexOf("isPendingReadyVirtualAccountPayment");
  const reserveIndex = checkout.indexOf("reserve_virtual_account_registration");
  const payloadIndex = checkout.indexOf("createNicepayPaymentPayload({");

  assert.notEqual(activeCheckIndex, -1, "checkout must check for an active virtual-account ledger");
  assert.ok(activeCheckIndex < reserveIndex, "active-ledger rejection must occur before reservation");
  assert.ok(activeCheckIndex < payloadIndex, "active-ledger rejection must occur before payload creation");
  assert.match(
    checkout.slice(activeCheckIndex, reserveIndex),
    /status:\s*409/,
    "repeat checkout must be rejected before NICEPAY can be opened",
  );

  const failGuardIndex = fail.indexOf("isPendingReadyVirtualAccountPayment");
  const failCancellationIndex = fail.indexOf(".update({ status: 'cancelled' })");

  assert.notEqual(failGuardIndex, -1, "generic checkout cleanup must detect an active account");
  assert.ok(
    failGuardIndex < failCancellationIndex,
    "generic checkout cleanup must preserve the active registration before cancellation",
  );

  const conflictStart = confirm.indexOf("if (issuanceError || issuanceRecorded !== true)");
  const conflictEnd = confirm.indexOf("return NextResponse.redirect(\n        redirectUrl(request, \"/payment/pending\"", conflictStart);
  const conflictBlock = confirm.slice(conflictStart, conflictEnd);

  assert.match(conflictBlock, /isPendingReadyVirtualAccountPayment/);
  assert.match(conflictBlock, /shouldCancelRegistrationAfterIssuanceConflict/);
});

test("confirmed callbacks require an exact ledger identity before idempotent redirect", () => {
  assert.equal(
    typeof nicepayModule.isMatchingConfirmedNicepayPayment,
    "function",
    "must expose a behavioral confirmed-ledger identity check",
  );

  const payment = {
    registration_id: "registration-1",
    payment_key: "tid-original",
    order_id: "order-1",
    amount: 10000,
    payment_method: "카드",
    status: "success",
    provider_status: null,
    expires_at: null,
  };
  const expected = {
    registrationId: "registration-1",
    tid: "tid-original",
    orderId: "order-1",
    amount: 10000,
    paymentMethod: "카드",
  };

  assert.equal(nicepayModule.isMatchingConfirmedNicepayPayment(payment, expected), true);
  assert.equal(
    nicepayModule.isMatchingConfirmedNicepayPayment(
      payment,
      { ...expected, tid: "tid-second" },
    ),
    false,
    "a second approved TID must not be treated as an idempotent replay",
  );
  assert.equal(
    nicepayModule.isMatchingConfirmedNicepayPayment(
      payment,
      { ...expected, paymentMethod: "카카오페이" },
    ),
    false,
    "the final provider method must match the ledger",
  );
  for (const mismatch of [
    { registrationId: "registration-2" },
    { orderId: "order-2" },
    { amount: 10001 },
  ]) {
    assert.equal(
      nicepayModule.isMatchingConfirmedNicepayPayment(
        payment,
        { ...expected, ...mismatch },
      ),
      false,
      "every confirmed callback identity field must match the ledger",
    );
  }

  const confirmedStart = confirm.indexOf('if (registration.status === "confirmed")');
  const confirmedEnd = confirm.indexOf(
    'if (paymentMethod === "가상계좌" && approval.providerStatus === "ready")',
    confirmedStart,
  );
  const confirmedBlock = confirm.slice(confirmedStart, confirmedEnd);
  const identityCheckIndex = confirmedBlock.indexOf("isMatchingConfirmedNicepayPayment");
  const compensationIndex = confirmedBlock.indexOf("cancelNicepayPayment");
  const successIndex = confirmedBlock.indexOf('"/payment/success"');

  assert.notEqual(identityCheckIndex, -1, "confirmed callbacks must verify the stored ledger");
  assert.ok(compensationIndex > identityCheckIndex, "a ledger mismatch must enter compensation");
  assert.ok(successIndex > identityCheckIndex, "success must occur only after the identity check");
  assert.match(
    confirmedBlock,
    /compensation\.ok[\s\S]*?추가 결제를 취소하지 못했습니다/,
    "compensation failure must return a clear failure path",
  );
  assert.doesNotMatch(
    confirmedBlock,
    /markPendingRegistrationCancelled/,
    "confirmed callback compensation must never change registration state",
  );
});

test("card cancellation acknowledgement requires an update or already-cancelled state", () => {
  assert.equal(
    typeof nicepayModule.canAcknowledgeNicepayCardCancellation,
    "function",
    "must expose a behavioral cancellation acknowledgement decision",
  );
  assert.equal(
    nicepayModule.canAcknowledgeNicepayCardCancellation({
      updateSucceeded: true,
      currentStatus: "confirmed",
    }),
    true,
  );
  assert.equal(
    nicepayModule.canAcknowledgeNicepayCardCancellation({
      updateSucceeded: false,
      currentStatus: "cancelled",
    }),
    true,
  );
  assert.equal(
    nicepayModule.canAcknowledgeNicepayCardCancellation({
      updateSucceeded: false,
      currentStatus: "confirmed",
    }),
    false,
    "an unprocessed cancellation must remain retryable",
  );
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

test("checkout route rejects omitted methods while the payload helper preserves property presence", () => {
  assert.match(
    checkout,
    /const method = getCheckoutMethod\(checkoutRequest\.method\)[\s\S]*?if \(!method\)/,
    "checkout must explicitly reject an omitted or unknown request method",
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

  const getFunction = (name) => {
    const match = sql.match(new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`,
    ));

    assert.ok(match, `${name} must be defined as a complete SQL function`);
    return match[0];
  };
  const rpcDefinitions = [
    {
      name: "reserve_virtual_account_registration",
      signature: "UUID, UUID, TIMESTAMPTZ",
    },
    {
      name: "record_virtual_account_issuance",
      signature: "UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ",
    },
    {
      name: "confirm_virtual_account_deposit",
      signature: "UUID, TEXT, TEXT, INTEGER",
    },
    {
      name: "fail_virtual_account_payment",
      signature: "UUID, TEXT, TEXT, TEXT",
    },
  ].map((definition) => ({ ...definition, functionSql: getFunction(definition.name) }));
  const newRpcNamePattern = rpcDefinitions.map(({ name }) => name).join("|");
  const assertNewRpcPermissions = (migration) => {
    const permissionSectionStart = migration.indexOf(
      "REVOKE ALL ON FUNCTION public.reserve_virtual_account_registration",
    );

    assert.notEqual(permissionSectionStart, -1, "new RPC permission section must exist");

    const permissionSection = migration.slice(permissionSectionStart);
    const allGrantMatches = [
      ...migration.matchAll(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.(${newRpcNamePattern})\\(([^)]*)\\) TO ([^;]+);`,
        "g",
      )),
    ];

    assert.ok(allGrantMatches.length > 0, "new RPCs must have EXECUTE grants");
    assert.deepEqual(
      allGrantMatches.map((match) => match[3].trim()),
      Array(allGrantMatches.length).fill("service_role"),
      "new virtual-account RPC EXECUTE grants must target only service_role",
    );

    for (const { name, signature } of rpcDefinitions) {
      const functionSignature = `public\\.${name}\\(${signature}\\)`;
      const grantMatches = [
        ...migration.matchAll(new RegExp(`GRANT EXECUTE ON FUNCTION ${functionSignature} TO ([^;]+);`, "g")),
      ];

      assert.match(permissionSection, new RegExp(
        `REVOKE ALL ON FUNCTION ${functionSignature} FROM PUBLIC;`,
      ));
      assert.match(permissionSection, new RegExp(
        `REVOKE ALL ON FUNCTION ${functionSignature} FROM authenticated;`,
      ));
      assert.deepEqual(
        grantMatches.map((match) => match[1].trim()),
        ["service_role"],
        `${name} must grant EXECUTE only to service_role`,
      );
    }
    assert.doesNotMatch(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.(?:${newRpcNamePattern})\\([^;]+\\) TO (?:anon|authenticated|PUBLIC)(?:;|,)`,
        "i",
      ),
      "new RPCs must not grant EXECUTE to anon, authenticated, or PUBLIC",
    );
  };
  const reserve = rpcDefinitions[0].functionSql;
  const issuance = rpcDefinitions[1].functionSql;
  const deposit = rpcDefinitions[2].functionSql;
  const failure = rpcDefinitions[3].functionSql;

  assert.match(sql, /ADD COLUMN IF NOT EXISTS provider_status TEXT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS vbank_number TEXT/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reserve_virtual_account_registration/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_virtual_account_issuance/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.confirm_virtual_account_deposit/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fail_virtual_account_payment/);
  assert.match(sql, /FOR UPDATE/, "payment lifecycle functions must lock their registration");
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.confirm_virtual_account_deposit[\s\S]+TO service_role/);

  for (const definition of rpcDefinitions) {
    const { name, functionSql } = definition;

    assert.match(functionSql, /SECURITY DEFINER/);
    assert.match(functionSql, /SET search_path = public/);
    assert.match(
      functionSql,
      /FROM public\.workshop_registrations_v2[\s\S]*?FOR UPDATE/,
      `${name} must lock its registration`,
    );
  }
  assertNewRpcPermissions(sql);
  assert.throws(
    () => assertNewRpcPermissions(
      "GRANT EXECUTE ON FUNCTION public.reserve_virtual_account_registration(UUID, UUID, TIMESTAMPTZ) TO anon;\n"
        + sql,
    ),
    /new virtual-account RPC EXECUTE grants must target only service_role/,
    "a non-service grant before the revoke section must be rejected",
  );

  assert.match(reserve, /v_registration\.user_id IS DISTINCT FROM p_user_id/);
  assert.match(reserve, /v_registration\.status IS DISTINCT FROM 'pending'/);
  assert.match(issuance, /v_registration\.status IS DISTINCT FROM 'pending'/);
  assert.match(issuance, /v_registration\.order_id IS DISTINCT FROM p_order_id/);
  assert.match(issuance, /v_registration\.amount IS DISTINCT FROM p_amount/);
  assert.match(issuance, /v_tid_payment\.registration_id IS DISTINCT FROM p_registration_id/);
  assert.match(issuance, /v_tid_payment\.order_id IS DISTINCT FROM p_order_id/);
  assert.match(issuance, /v_tid_payment\.amount IS DISTINCT FROM p_amount/);
  assert.match(issuance, /v_tid_payment\.payment_method IS DISTINCT FROM '가상계좌'/);
  assert.match(
    issuance,
    /v_tid_payment\.registration_id IS NOT DISTINCT FROM p_registration_id[\s\S]+?v_tid_payment\.order_id IS NOT DISTINCT FROM p_order_id[\s\S]+?v_tid_payment\.amount IS NOT DISTINCT FROM p_amount[\s\S]+?v_tid_payment\.payment_method IS NOT DISTINCT FROM '가상계좌'/,
    "same-TID issuance retries must require the same virtual-account registration, order, and amount",
  );

  assert.match(deposit, /v_registration\.order_id IS DISTINCT FROM p_order_id/);
  assert.match(deposit, /v_registration\.amount IS DISTINCT FROM p_amount/);
  assert.match(deposit, /v_payment\.order_id IS DISTINCT FROM p_order_id/);
  assert.match(deposit, /v_payment\.amount IS DISTINCT FROM p_amount/);
  assert.match(deposit, /v_registration\.status IS NOT DISTINCT FROM 'confirmed'/);
  assert.match(deposit, /v_payment\.status IS NOT DISTINCT FROM 'success'/);
  assert.match(deposit, /v_payment\.provider_status IS NOT DISTINCT FROM 'paid'/);
  assert.match(deposit, /v_registration\.status IS DISTINCT FROM 'pending'/);
  assert.match(deposit, /v_payment\.status IS DISTINCT FROM 'pending'/);
  assert.match(deposit, /v_payment\.provider_status IS DISTINCT FROM 'ready'/);
  assert.match(deposit, /v_payment\.payment_method IS DISTINCT FROM '가상계좌'/);

  assert.match(failure, /v_registration\.order_id IS DISTINCT FROM p_order_id/);
  assert.match(failure, /v_payment\.order_id IS DISTINCT FROM p_order_id/);
  assert.match(failure, /v_payment\.status IS NOT DISTINCT FROM 'failed'/);
  assert.match(failure, /v_payment\.status IS NOT DISTINCT FROM 'cancelled'/);
  assert.match(failure, /v_payment\.provider_status IS NOT DISTINCT FROM p_provider_status/);
  assert.match(failure, /v_registration\.status IS NOT DISTINCT FROM 'cancelled'/);
  assert.match(failure, /p_provider_status IS DISTINCT FROM 'failed'/);
  assert.match(failure, /p_provider_status IS DISTINCT FROM 'expired'/);
  assert.match(failure, /p_provider_status IS DISTINCT FROM 'cancelled'/);
  assert.match(failure, /v_payment\.payment_method IS DISTINCT FROM '가상계좌'/);
  assert.match(failure, /v_payment\.status IS DISTINCT FROM 'pending'/);
  assert.match(failure, /v_payment\.provider_status IS DISTINCT FROM 'ready'/);
  assert.match(failure, /v_registration\.status IS DISTINCT FROM 'pending'/);
  assert.match(failure, /v_payment\.amount IS DISTINCT FROM v_registration\.amount/);
  assert.match(failure, /p_provider_status IS NOT DISTINCT FROM 'cancelled'/);
});
