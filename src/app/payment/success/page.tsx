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
  const orderId = searchParams.get("order_id");
  const amount = searchParams.get("amount");
  const registrationId = searchParams.get("registration_id");
  const workshopId = searchParams.get("workshop");
  const returnPath = buildWorkshopReturnPath(workshopId);

  return (
    <div className="login-overlay-wrapper active payment-success-wrapper">
      <div className="login-dimmer" />
      <div className="login-modal-card payment-success-card">
        <div className="login-modal-frame">
          <div className="login-modal-body">
            <div className="login-intro payment-success-intro">
              <h3>결제가 성공적으로 완료되었습니다.</h3>
              <p>워크숍 신청이 완료되었습니다.</p>
            </div>

            <div className="payment-success-meta" aria-label="결제 완료 정보">
              <div className="payment-success-meta-row">
                <span>신청 번호</span>
                <span>{registrationId || "-"}</span>
              </div>
              <div className="payment-success-meta-row">
                <span>주문 번호</span>
                <span>{orderId || "-"}</span>
              </div>
              {amount && (
                <div className="payment-success-meta-row">
                  <span>결제 금액</span>
                  <span>{Number(amount).toLocaleString()}원</span>
                </div>
              )}
            </div>

            <button
              className="email-submit-btn payment-success-return-btn"
              onClick={() => router.push(returnPath)}
            >
              워크숍 신청 페이지로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
