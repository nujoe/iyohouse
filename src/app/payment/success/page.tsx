"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("order_id");
  const amount = searchParams.get("amount");
  const registrationId = searchParams.get("registration_id");

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "sans-serif",
      padding: "20px",
      textAlign: "center",
    }}>
      <h1 style={{ color: "#2563eb" }}>
        결제 확인이 완료되었습니다.
      </h1>
      <p>신청 번호: {registrationId || "-"}</p>
      <p>주문 번호: {orderId || "-"}</p>
      {amount && <p>결제 금액: {Number(amount).toLocaleString()}원</p>}
      <button
        onClick={() => router.push("/")}
        style={{
          marginTop: "20px",
          padding: "10px 30px",
          background: "#000",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          fontSize: "16px",
        }}
      >
        홈으로 돌아가기
      </button>
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
