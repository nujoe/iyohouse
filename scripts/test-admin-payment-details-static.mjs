import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("payment confirmation persists only a normalized NICEPAY payment method", () => {
  const migrationPath = new URL(
    "supabase/migrations/20260729000000_add_payment_method_to_confirmation.sql",
    root,
  );
  assert.equal(existsSync(migrationPath), true, "missing payment method confirmation migration");

  const nicepay = read("src/lib/payment/nicepay.ts");
  assert.match(nicepay, /export function getNicepayPaymentMethod/, "missing normalized NICEPAY method helper");
  assert.match(nicepay, /PayMethod/, "helper must inspect NICEPAY final payment method");
  assert.match(nicepay, /KAKAOPAY/, "helper must recognize easy-payment methods");

  const confirm = read("src/app/api/payment/confirm/route.ts");
  assert.match(
    confirm,
    /const paymentMethod = getNicepayPaymentMethod\(approval\.payload\)[\s\S]*?p_payment_method:\s*paymentMethod/,
    "approval route must persist the final normalized NICEPAY method",
  );

  const webhook = read("src/app/api/payment/webhook/route.ts");
  assert.match(
    webhook,
    /const reportedPaymentMethod = getNicepayPaymentMethod\(fields\)[\s\S]*?p_payment_method:\s*reportedPaymentMethod/,
    "payment webhook must persist its verified NICEPAY method",
  );

  const migration = read("supabase/migrations/20260729000000_add_payment_method_to_confirmation.sql");
  assert.match(migration, /confirm_payment_registration\(\s*p_registration_id UUID,\s*p_payment_key TEXT,\s*p_order_id TEXT,\s*p_amount INTEGER,\s*p_payment_method TEXT/s, "migration must add a five-argument RPC overload");
  assert.match(migration, /NULLIF\(BTRIM\(p_payment_method\), ''\)/, "migration must normalize blank methods to null");
  assert.match(migration, /payment_method/, "migration must store payment method in the payment ledger");
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.confirm_payment_registration\(UUID, TEXT, TEXT, INTEGER, TEXT\) TO service_role/, "new RPC must remain service-role-only");
});

test("admin applicants read payment ledger details without changing cancelled or schedule controls", () => {
  const admin = read("src/lib/admin/workshopAdmin.ts");
  assert.match(admin, /payment_amount/, "admin applicant row must expose recorded payment amount");
  assert.match(admin, /payment_method/, "admin applicant row must expose recorded payment method");
  assert.match(admin, /\.from\("payments"\)/, "admin detail must read the payment ledger server-side");
  assert.match(admin, /\.in\("registration_id",\s*confirmedRegistrationIds\)/, "payment lookup must be limited to confirmed registrations");
  assert.match(admin, /\.eq\("status",\s*"success"\)/, "admin must display successful payments only");

  const client = read("src/components/admin/AdminWorkshopApplicantsClient.tsx");
  assert.match(client, />결제금액</, "confirmed table must show payment amount header");
  assert.match(client, />결제수단</, "confirmed table must show payment method header");
  assert.match(client, /일정 변경/, "schedule controls must remain rendered");
  assert.match(client, /기록 없음/, "missing historical method must be explicit");

  const styles = read("src/styles/13-admin.css");
  assert.match(styles, /\.admin-applicants-table\s*\{[\s\S]*?min-width:\s*1200px/, "confirmed table needs room for payment columns and schedule controls");
  assert.match(styles, /\.admin-payment-amount-cell/, "payment amount needs a compact explicit column style");
  assert.match(styles, /\.admin-payment-method-cell/, "payment method needs a compact explicit column style");
});

test("admin renders active virtual-account deposits in a separate read-only table", () => {
  const client = read("src/components/admin/AdminWorkshopApplicantsClient.tsx");
  const sectionStart = client.indexOf("function renderPendingVirtualAccountSection");

  assert.notEqual(sectionStart, -1, "pending virtual accounts need an independent section renderer");

  const section = client.slice(sectionStart, client.indexOf("\nexport default", sectionStart));
  assert.match(section, /가상계좌 입금 대기/, "pending deposits need their own section heading");
  assert.match(section, />이름</);
  assert.match(section, />이메일</);
  assert.match(section, />결제금액</);
  assert.match(section, />은행</);
  assert.match(section, />계좌번호</);
  assert.match(section, />입금기한</);
  assert.match(section, /admin-table-wrap/, "pending deposits must retain the responsive table wrapper");
  assert.doesNotMatch(section, /type="checkbox"|일정 변경|취소\/환불/, "pending deposits must remain read-only");

  const page = read("src/app/admin/workshops/[workshopId]/page.tsx");
  assert.match(page, /pendingVirtualAccounts=\{pendingVirtualAccounts\}/, "page must pass pending accounts to the client");

  const styles = read("src/styles/13-admin.css");
  assert.match(styles, /\.admin-virtual-account-/, "pending-account styles must remain narrowly scoped");
});
