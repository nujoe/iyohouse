import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const filePath = join(root, relativePath);

  if (!existsSync(filePath)) {
    failures.push(`${relativePath} is missing.`);
    return "";
  }

  return readFileSync(filePath, "utf8");
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

requireIncludes("src/components/workshop/WorkshopDetailOverlay.tsx", [
  "const workshopId = ws._id || ws.id",
  "const workshopTitle = getLocalizedWorkshopTitle(ws, language, t) || workshop_title",
  "workshopId: workshopId ? String(workshopId) : undefined",
  "workshopTitle",
]);

requireIncludes("src/app/api/payment/checkout/route.ts", [
  "workshopId?: string",
  "workshopTitle?: string",
  "const { registration_id, orderName, method, scheduleLabel, workshopId, workshopTitle }",
  "mallReserved.set(\"workshop\", workshopId)",
  "mallReserved.set(\"workshop_title\", workshopTitle)",
]);

requireIncludes("src/app/api/payment/confirm/route.ts", [
  "const reservedParams = new URLSearchParams(auth.mallReserved || \"\")",
  "const workshopId = reservedParams.get(\"workshop\") || undefined",
  "const workshopTitle = reservedParams.get(\"workshop_title\") || undefined",
  "workshop: workshopId",
  "workshop_title: workshopTitle",
]);

requireIncludes("src/app/payment/success/page.tsx", [
  "function buildWorkshopReturnPath",
  "preset: \"workshop\"",
  "searchParams.get(\"workshop\")",
  "searchParams.get(\"workshop_title\")",
  "결제가 성공적으로 완료되었습니다.",
  "워크숍 신청 페이지로 돌아가기",
  "payment-success-workshop-title",
  "login-overlay-wrapper active payment-success-wrapper",
  "login-modal-card payment-success-card",
  "login-modal-frame",
  "login-modal-body",
  "login-intro payment-success-intro",
]);

requireExcludes("src/app/payment/success/page.tsx", [
  "router.push(\"/\")",
  "홈으로 돌아가기",
  "신청 번호",
  "주문 번호",
  "searchParams.get(\"registration_id\")",
  "searchParams.get(\"order_id\")",
  "style={{",
]);

requireIncludes("src/styles/09-auth.css", [
  ".payment-success-wrapper",
  ".payment-success-card",
  ".payment-success-workshop-title",
  ".payment-success-meta",
  ".payment-success-return-btn",
]);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("payment success workshop return static checks passed.");
