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

function FailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const returnPath = buildWorkshopReturnPath(searchParams.get("workshop"));

  return (
    <main className="nicepay-payment-shell">
      <section className="nicepay-payment-card">
        <h1 className="nicepay-payment-heading">결제를 완료하지 못했습니다.</h1>
        <p className="nicepay-payment-copy">잠시 후 다시 시도해 주세요.</p>
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

export default function PaymentFailPage() {
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
      <FailContent />
    </Suspense>
  );
}
