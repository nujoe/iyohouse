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
const overlay = readRoute("src/components/workshop/WorkshopDetailOverlay.tsx");
const modal = readRoute("src/components/workshop/NicepayPaymentMethodModal.tsx");
const success = readRoute("src/app/payment/success/page.tsx");
const failPage = readRoute("src/app/payment/fail/page.tsx");
const globals = readRoute("src/app/globals.css");
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
  assert.match(checkout, /begin_virtual_account_checkout/);
  assert.match(confirm, /record_virtual_account_issuance/);
  assert.match(confirm, /release_virtual_account_checkout/);
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

test("payment UI uses the isolated NICEPAY method and status surfaces", () => {
  assert.match(overlay, /NicepayPaymentMethodModal/);
  assert.match(modal, /aria-label="결제수단 선택 닫기"/);
  assert.match(modal, /카드·간편결제/);
  assert.match(modal, /가상계좌/);
  assert.match(overlay, /method,?\s*:\s*selectedMethod/);
  assert.equal(existsSync(join(root, "src/app/payment/pending/page.tsx")), true);
  assert.match(globals, /14-payment\.css/);
  assert.doesNotMatch(success, /login-modal-card/);
  assert.doesNotMatch(failPage, /style=\{\{/);
});

test("persisted checkout intent serializes vbank starts and protects the winning ledger", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/20260729000001_add_virtual_account_payment_lifecycle.sql"),
    "utf8",
  );
  const getFunction = (name) => {
    const match = sql.match(new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`,
    ));

    assert.ok(match, `${name} must be defined`);
    return match[0];
  };
  const begin = getFunction("begin_virtual_account_checkout");
  const issuance = getFunction("record_virtual_account_issuance");
  const release = getFunction("release_virtual_account_checkout");

  assert.match(
    sql,
    /CREATE TABLE public\.virtual_account_checkout_intents[\s\S]*?registration_id UUID PRIMARY KEY[\s\S]*?attempt_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid\(\)[\s\S]*?user_id UUID NOT NULL REFERENCES public\.profiles\(id\)[\s\S]*?expires_at TIMESTAMPTZ NOT NULL[\s\S]*?created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)[\s\S]*?updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/,
    "one registration can own only one persisted checkout intent",
  );
  assert.match(
    begin,
    /FROM public\.workshop_registrations_v2[\s\S]*?FOR UPDATE[\s\S]*?FROM public\.virtual_account_checkout_intents[\s\S]*?FOR UPDATE[\s\S]*?INSERT INTO public\.virtual_account_checkout_intents/,
    "concurrent begin calls must serialize on the registration before intent insertion",
  );
  assert.match(begin, /RETURNS JSONB/);
  assert.match(begin, /jsonb_build_object\('status', 'intent_exists'\)/);
  assert.match(begin, /jsonb_build_object\('status', 'active_payment_exists'\)/);
  assert.match(begin, /jsonb_build_object\('status', 'started', 'attempt_id', v_attempt_id\)/);

  const intentLockIndex = issuance.indexOf("FROM public.virtual_account_checkout_intents");
  const paymentInsertIndex = issuance.indexOf("INSERT INTO public.payments");
  const intentDeleteIndex = issuance.indexOf("DELETE FROM public.virtual_account_checkout_intents");

  assert.ok(intentLockIndex >= 0 && intentLockIndex < paymentInsertIndex);
  assert.ok(paymentInsertIndex < intentDeleteIndex);
  assert.match(
    issuance.slice(intentLockIndex, paymentInsertIndex),
    /attempt_id = p_attempt_id[\s\S]*?FOR UPDATE[\s\S]*?IF NOT FOUND/,
    "new issuance must require and lock the winning intent",
  );

  const releasePaymentIndex = release.indexOf("FROM public.payments");
  const releasePreserveIndex = release.indexOf("RETURN 'preserved'");
  const staleGuardIndex = release.indexOf("RETURN 'stale_attempt'");
  const releaseIntentDeleteIndex = release.indexOf("DELETE FROM public.virtual_account_checkout_intents");
  const releaseCancelIndex = release.indexOf("SET status = 'cancelled'");

  assert.ok(releasePaymentIndex >= 0 && releasePaymentIndex < releasePreserveIndex);
  assert.ok(staleGuardIndex >= 0 && staleGuardIndex < releaseIntentDeleteIndex);
  assert.ok(releasePreserveIndex < releaseIntentDeleteIndex);
  assert.ok(releasePreserveIndex < releaseCancelIndex);
  assert.match(
    release.slice(releasePaymentIndex, releasePreserveIndex),
    /payment_method IS NOT DISTINCT FROM '가상계좌'[\s\S]*?FOR UPDATE[\s\S]*?v_payment\.checkout_attempt_id IS DISTINCT FROM p_attempt_id[\s\S]*?status IS NOT DISTINCT FROM 'pending'[\s\S]*?provider_status IS NOT DISTINCT FROM 'ready'[\s\S]*?expires_at > NOW\(\)/,
    "losing cleanup must lock and preserve a winning ready ledger",
  );

  const beginIndex = checkout.indexOf("begin_virtual_account_checkout");
  const payloadIndex = checkout.indexOf("createNicepayPaymentPayload({");

  assert.ok(beginIndex >= 0 && beginIndex < payloadIndex);
  assert.match(
    checkout.slice(beginIndex, payloadIndex),
    /beginStatus === "intent_exists"[\s\S]*?status:\s*409/,
    "the second serialized begin result must stop before requestPay payload creation",
  );
  assert.match(checkout, /mallReserved\.set\("checkout_attempt_id", checkoutAttemptId\)/);
  assert.match(
    checkout,
    /new URL\(String\(payload\.returnUrl\)\)[\s\S]*?searchParams\.set\("checkout_attempt_id", checkoutAttemptId\)/,
    "the provider return URL must carry the same unguessable attempt ID",
  );
  assert.doesNotMatch(checkout, /\.from\("payments"\)/);
  assert.doesNotMatch(checkout, /reserve_virtual_account_registration/);

  assert.match(fail, /release_virtual_account_checkout/);
  assert.match(fail, /p_attempt_id:\s*checkoutAttemptId/);
  assert.doesNotMatch(fail, /\.from\('payments'\)/);
  assert.doesNotMatch(fail, /\.update\(\{ status: 'cancelled' \}\)/);

  assert.match(confirm, /release_virtual_account_checkout/);
  assert.match(confirm, /p_attempt_id:\s*checkoutAttemptId/);
  assert.match(
    confirm,
    /queryAttemptId && reservedAttemptId && queryAttemptId !== reservedAttemptId[\s\S]*?return null/,
    "conflicting callback metadata must not select either attempt",
  );
  assert.match(
    confirm,
    /paymentMethod === "가상계좌" && !checkoutAttemptId[\s\S]*?"\/payment\/fail"[\s\S]*?record_virtual_account_issuance/,
    "a verified vbank approval without correlation must stop before issuance recording",
  );
  assert.doesNotMatch(confirm, /markPendingRegistrationCancelled/);
  assert.doesNotMatch(confirm, /isPendingReadyVirtualAccountPayment/);
});

test("ambiguous issuance errors verify the exact ready ledger before compensation", () => {
  const conflictStart = confirm.indexOf("if (issuanceError || issuanceRecorded !== true)");
  const conflictEnd = confirm.indexOf(
    'if (approval.providerStatus !== "paid"',
    conflictStart,
  );
  const conflictBlock = confirm.slice(conflictStart, conflictEnd);
  const ledgerReadIndex = conflictBlock.indexOf('.from("payments")');
  const compensationIndex = conflictBlock.indexOf("cancelNicepayPayment");

  assert.ok(conflictStart >= 0 && conflictEnd > conflictStart);
  assert.ok(ledgerReadIndex >= 0 && ledgerReadIndex < compensationIndex);
  assert.match(
    conflictBlock,
    /\.eq\("registration_id", registration\.id\)[\s\S]*?\.eq\("order_id", registration\.order_id\)[\s\S]*?\.eq\("payment_key", approval\.tid\)[\s\S]*?\.eq\("amount", Number\(registration\.amount\)\)[\s\S]*?\.eq\("payment_method", "가상계좌"\)/,
    "the post-error read must use the full approved ledger identity",
  );
  assert.match(
    conflictBlock.slice(ledgerReadIndex, compensationIndex),
    /issuanceLookupError[\s\S]*?운영자에게 문의[\s\S]*?matchingReadyPayment[\s\S]*?"\/payment\/pending"/,
    "read errors must stop safely and an exact ready ledger must redirect pending before compensation",
  );
});

test("expired ready ledgers transition atomically and expiry callbacks remain idempotent", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/20260729000001_add_virtual_account_payment_lifecycle.sql"),
    "utf8",
  );
  const getFunction = (name) => {
    const match = sql.match(new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`,
    ));

    assert.ok(match, `${name} must be defined`);
    return match[0];
  };
  const release = getFunction("release_virtual_account_checkout");
  const failure = getFunction("fail_virtual_account_payment");
  const expiredLedgerIndex = release.indexOf("expires_at <= NOW()");
  const ledgerTransitionIndex = release.indexOf("UPDATE public.payments", expiredLedgerIndex);
  const registrationTransitionIndex = release.indexOf(
    "UPDATE public.workshop_registrations_v2",
    ledgerTransitionIndex,
  );

  assert.ok(expiredLedgerIndex >= 0);
  assert.ok(ledgerTransitionIndex > expiredLedgerIndex);
  assert.ok(registrationTransitionIndex > ledgerTransitionIndex);
  assert.match(
    release.slice(ledgerTransitionIndex, registrationTransitionIndex),
    /SET status = 'failed'[\s\S]*?provider_status = 'expired'/,
    "local expiry cleanup must transition the ledger before releasing the seat",
  );
  assert.match(
    failure,
    /v_registration\.status IS DISTINCT FROM 'pending'[\s\S]*?v_registration\.status IS DISTINCT FROM 'cancelled'[\s\S]*?v_registration\.status IS DISTINCT FROM 'expired'/,
    "provider expiry must finish a ready ledger after prior registration cleanup",
  );
  assert.match(
    webhook,
    /\["pending", "cancelled", "expired"\]\.includes\(registration\.status\)[\s\S]*?payment\.status !== "pending"[\s\S]*?payment\.provider_status !== "ready"[\s\S]*?fail_virtual_account_payment/,
    "webhook routing must not skip a ready ledger merely because registration cleanup already ran",
  );
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
      name: "begin_virtual_account_checkout",
      signature: "UUID, UUID, TIMESTAMPTZ",
    },
    {
      name: "record_virtual_account_issuance",
      signature: "UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ",
    },
    {
      name: "confirm_virtual_account_deposit",
      signature: "UUID, TEXT, TEXT, INTEGER",
    },
    {
      name: "fail_virtual_account_payment",
      signature: "UUID, TEXT, TEXT, TEXT",
    },
    {
      name: "release_virtual_account_checkout",
      signature: "UUID, UUID, UUID",
    },
  ].map((definition) => ({ ...definition, functionSql: getFunction(definition.name) }));
  const newRpcNamePattern = rpcDefinitions.map(({ name }) => name).join("|");
  const assertNewRpcPermissions = (migration) => {
    const permissionSectionStart = migration.indexOf(
      "REVOKE ALL ON FUNCTION public.begin_virtual_account_checkout",
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
  const begin = rpcDefinitions[0].functionSql;
  const issuance = rpcDefinitions[1].functionSql;
  const deposit = rpcDefinitions[2].functionSql;
  const failure = rpcDefinitions[3].functionSql;
  const release = rpcDefinitions[4].functionSql;

  assert.match(sql, /ADD COLUMN IF NOT EXISTS provider_status TEXT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS checkout_attempt_id UUID/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS vbank_number TEXT/);
  assert.match(sql, /CREATE TABLE public\.virtual_account_checkout_intents/);
  assert.match(sql, /ALTER TABLE public\.virtual_account_checkout_intents ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.virtual_account_checkout_intents FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.virtual_account_checkout_intents FROM anon/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.virtual_account_checkout_intents FROM authenticated/);
  assert.match(sql, /GRANT ALL ON TABLE public\.virtual_account_checkout_intents TO service_role/);
  assert.doesNotMatch(
    sql,
    /CREATE POLICY[\s\S]*?ON public\.virtual_account_checkout_intents/,
    "checkout intents must have no client RLS policy",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.begin_virtual_account_checkout/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_virtual_account_issuance/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.confirm_virtual_account_deposit/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fail_virtual_account_payment/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.release_virtual_account_checkout/);
  assert.doesNotMatch(sql, /reserve_virtual_account_registration/);
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
      "GRANT EXECUTE ON FUNCTION public.begin_virtual_account_checkout(UUID, UUID, TIMESTAMPTZ) TO anon;\n"
        + sql,
    ),
    /new virtual-account RPC EXECUTE grants must target only service_role/,
    "a non-service grant before the revoke section must be rejected",
  );

  assert.match(begin, /v_registration\.user_id IS DISTINCT FROM p_user_id/);
  assert.match(begin, /v_registration\.status IS DISTINCT FROM 'pending'/);
  assert.match(begin, /v_registration\.expires_at IS NULL OR v_registration\.expires_at <= NOW\(\)/);
  assert.match(begin, /FROM public\.virtual_account_checkout_intents[\s\S]*?FOR UPDATE/);
  assert.match(begin, /FROM public\.payments[\s\S]*?payment_method IS NOT DISTINCT FROM '가상계좌'[\s\S]*?status IS NOT DISTINCT FROM 'pending'[\s\S]*?provider_status IS NOT DISTINCT FROM 'ready'[\s\S]*?expires_at > NOW\(\)[\s\S]*?FOR UPDATE/);
  assert.match(begin, /INSERT INTO public\.virtual_account_checkout_intents/);
  assert.match(begin, /SET expires_at = p_expires_at/);
  assert.match(begin, /v_attempt_id := gen_random_uuid\(\)/);
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
  assert.match(
    issuance,
    /FROM public\.virtual_account_checkout_intents[\s\S]*?WHERE registration_id = p_registration_id[\s\S]*?FOR UPDATE[\s\S]*?IF NOT FOUND/,
    "new issuance must require its persisted intent",
  );
  assert.match(issuance, /attempt_id = p_attempt_id/);
  assert.match(issuance, /checkout_attempt_id[\s\S]*?p_attempt_id/);
  assert.match(
    issuance,
    /INSERT INTO public\.payments[\s\S]*?DELETE FROM public\.virtual_account_checkout_intents[\s\S]*?WHERE registration_id = p_registration_id/,
    "issuance must consume the intent after recording the ready ledger",
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
  assert.match(failure, /v_registration\.status IS DISTINCT FROM 'cancelled'/);
  assert.match(failure, /p_provider_status IS DISTINCT FROM 'failed'/);
  assert.match(failure, /p_provider_status IS DISTINCT FROM 'expired'/);
  assert.match(failure, /p_provider_status IS DISTINCT FROM 'cancelled'/);
  assert.match(failure, /v_payment\.payment_method IS DISTINCT FROM '가상계좌'/);
  assert.match(failure, /v_payment\.status IS DISTINCT FROM 'pending'/);
  assert.match(failure, /v_payment\.provider_status IS DISTINCT FROM 'ready'/);
  assert.match(failure, /v_registration\.status IS DISTINCT FROM 'pending'/);
  assert.match(failure, /v_registration\.status IS DISTINCT FROM 'cancelled'/);
  assert.match(failure, /v_registration\.status IS DISTINCT FROM 'expired'/);
  assert.match(failure, /v_payment\.amount IS DISTINCT FROM v_registration\.amount/);
  assert.match(failure, /p_provider_status IS NOT DISTINCT FROM 'cancelled'/);

  assert.match(release, /v_registration\.user_id IS DISTINCT FROM p_user_id/);
  assert.match(release, /v_intent\.attempt_id IS DISTINCT FROM p_attempt_id/);
  assert.match(release, /v_payment\.checkout_attempt_id IS DISTINCT FROM p_attempt_id/);
  assert.match(
    release,
    /FROM public\.payments[\s\S]*?payment_method IS NOT DISTINCT FROM '가상계좌'[\s\S]*?FOR UPDATE[\s\S]*?v_payment\.status IS NOT DISTINCT FROM 'pending'[\s\S]*?v_payment\.provider_status IS NOT DISTINCT FROM 'ready'/,
  );
  assert.match(
    release,
    /RETURN 'stale_attempt';[\s\S]*?RETURN 'preserved';[\s\S]*?SET status = 'failed'[\s\S]*?provider_status = 'expired'[\s\S]*?DELETE FROM public\.virtual_account_checkout_intents[\s\S]*?attempt_id = p_attempt_id[\s\S]*?SET status = 'cancelled'[\s\S]*?status IS NOT DISTINCT FROM 'pending'/,
    "release must reject stale attempts, preserve active ledgers, and expire ready ledgers atomically",
  );
});
