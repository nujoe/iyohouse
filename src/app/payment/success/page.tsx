"use client";

import { useEffect, Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function SuccessContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [msg, setMsg] = useState("결제 승인 중...");

    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");

    useEffect(() => {
        if (!paymentKey || !orderId || !amount) {
            setStatus("error");
            setMsg("결제 정보가 부족합니다.");
            return;
        }

        const confirmPayment = async () => {
            try {
                const response = await fetch('/api/payment/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentKey, orderId, amount }),
                });

                const result = await response.json();
                if (result.success) {
                    setStatus("success");
                    setMsg("결제가 성공적으로 확인되었습니다!");
                } else {
                    setStatus("error");
                    setMsg(result.error || "결제 승인 과정에서 오류가 발생했습니다.");
                }
            } catch (err) {
                setStatus("error");
                setMsg("서버와 통신 중 오류가 발생했습니다.");
            }
        };

        confirmPayment();
    }, [paymentKey, orderId, amount]);

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'sans-serif',
            padding: '20px',
            textAlign: 'center'
        }}>
            <h1 style={{ color: status === 'success' ? '#2563eb' : (status === 'error' ? '#dc2626' : '#000') }}>
                {msg}
            </h1>
            {status === 'success' && (
                <>
                    <p>주문 번호: {orderId}</p>
                    <p>결제 금액: {Number(amount).toLocaleString()}원</p>
                </>
            )}
            <button
                onClick={() => router.push('/')}
                style={{
                    marginTop: '20px',
                    padding: '10px 30px',
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '16px'
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
