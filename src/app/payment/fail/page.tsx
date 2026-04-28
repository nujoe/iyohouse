"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function FailContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const code = searchParams.get("code");
    const message = searchParams.get("message");

    return (
        <div style={{ 
            height: '100vh', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontFamily: 'sans-serif'
        }}>
            <h1 style={{ color: '#dc2626' }}>결제에 실패했습니다.</h1>
            <p>에러 코드: {code}</p>
            <p>메시지: {message}</p>
            <button 
                onClick={() => router.push('/')}
                style={{
                    marginTop: '20px',
                    padding: '10px 20px',
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                }}
            >
                홈으로 돌아가기
            </button>
        </div>
    );
}

export default function PaymentFailPage() {
    return (
        <Suspense fallback={<div>로딩 중...</div>}>
            <FailContent />
        </Suspense>
    );
}
