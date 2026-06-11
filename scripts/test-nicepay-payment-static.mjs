import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath} is missing.`);
    return "";
  }

  return readFileSync(path, "utf8");
}

function requireIncludes(relativePath, needles) {
  const content = read(relativePath);

  for (const needle of needles) {
    if (!content.includes(needle)) {
      failures.push(`${relativePath} is missing "${needle}".`);
    }
  }

  return content;
}

function requireExcludes(relativePath, needles) {
  const content = read(relativePath);

  for (const needle of needles) {
    if (content.includes(needle)) {
      failures.push(`${relativePath} still contains "${needle}".`);
    }
  }

  return content;
}

const tossedNeedles = [
  "@tosspayments",
  "TOSS_",
  "loadTossPayments",
  "requestPayment",
  "api.tosspayments.com",
  "paymentKey",
];

for (const relativePath of [
  "package.json",
  "package-lock.json",
  ".env.example",
  "src/components/workshop/WorkshopDetailOverlay.tsx",
  "src/app/api/payment/confirm/route.ts",
  "src/app/api/payment/webhook/route.ts",
  "src/app/payment/success/page.tsx",
  "src/app/payment/fail/page.tsx",
]) {
  requireExcludes(relativePath, tossedNeedles);
}

requireIncludes("src/lib/payment/nicepay.ts", [
  "createHash",
  "getNicepayConfig",
  "createNicepayPaymentPayload",
  "approveNicepayPaymentAuth",
  "cancelNicepayPayment",
  "verifyNicepayAuthSignature",
  "verifyNicepayResultSignature",
  "safeNicepayPayload",
  "https://pay.nicepay.co.kr/v1/js/",
  "https://sandbox-api.nicepay.co.kr",
  "https://api.nicepay.co.kr",
  "/v1/payments/",
]);

requireIncludes("src/app/api/payment/checkout/route.ts", [
  "createNicepayPaymentPayload",
  "registration_id",
  "workshop_registrations_v2",
  "order_id",
  "amount",
  "scriptUrl",
]);

requireIncludes("src/app/api/payment/confirm/route.ts", [
  "parseNicepayRequest",
  "approveNicepayPaymentAuth",
  "confirm_payment_registration",
  "p_payment_key",
  "authResultCode",
  "cancelNicepayPayment",
  "compensation",
  "registration_id",
]);

requireIncludes("src/app/api/payment/webhook/route.ts", [
  "verifyNicepayResultSignature",
  "confirm_payment_registration",
  "workshop_registrations_v2",
  "cancelled",
  "payment_failed",
  "text/html;charset=utf-8",
  "new NextResponse(\"OK\"",
]);

requireExcludes("src/app/api/payment/confirm/route.ts", [
  "await markRegistrationCancelled(registration.id",
]);

requireExcludes("src/app/payment/fail/page.tsx", [
  "/api/payment/fail",
  "useEffect",
  "useRef",
]);

requireIncludes("src/components/workshop/WorkshopDetailOverlay.tsx", [
  "AUTHNICE",
  "/api/payment/checkout",
  "requestPay",
  "nicepayScriptUrl",
  "create_pending_registration",
]);

requireIncludes(".env.example", [
  "NEXT_PUBLIC_SITE_URL",
  "IYO_NICEPAY_ENABLED",
  "IYO_NICEPAY_CLIENT_KEY",
  "IYO_NICEPAY_SECRET_KEY",
  "IYO_NICEPAY_MODE",
]);

requireIncludes("docs/nicepay-payment-integration.md", [
  "NICEPAY",
  "confirm_payment_registration",
  "IYO_NICEPAY_CLIENT_KEY",
  "IYO_NICEPAY_SECRET_KEY",
  "총괄 관리자",
]);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("nicepay payment static checks passed.");
