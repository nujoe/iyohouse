"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function buildWorkshopReturnPath(workshopId: string | null) {
  const params = new URLSearchParams({ preset: "workshop" });

  if (workshopId) {
    params.set("workshop", workshopId);
  }

  return `/?${params.toString()}`;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const amount = searchParams.get("amount");
  const workshopId = searchParams.get("workshop");
  const workshopTitle = searchParams.get("workshop_title");
  const returnPath = buildWorkshopReturnPath(workshopId);

  return (
    <main className="nicepay-payment-shell">
      <section className="nicepay-payment-card">
        <h1 className="nicepay-payment-heading">결제가 성공적으로 완료되었습니다.</h1>
        {workshopTitle && <p className="nicepay-payment-workshop-title">{workshopTitle}</p>}
        <p className="nicepay-payment-copy">워크숍 신청이 완료되었습니다.</p>
        {amount && (
          <div className="nicepay-payment-details" aria-label="결제 완료 정보">
            <div className="nicepay-payment-detail-row">
              <span className="nicepay-payment-detail-label">결제 금액</span>
              <span className="nicepay-payment-detail-value">{Number(amount).toLocaleString()}원</span>
            </div>
          </div>
        )}
        <button
          type="button"
          className="nicepay-payment-action"
          onClick={() => router.push(returnPath)}
        >
          워크숍 신청 페이지로 돌아가기
        </button>
      </section>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={(
        <main className="nicepay-payment-shell">
          <section className="nicepay-payment-card">
            <p className="nicepay-payment-copy">결제 정보를 불러오는 중입니다.</p>
          </section>
        </main>
      )}
    >
      <SuccessContent />
    </Suspense>
  );
}
