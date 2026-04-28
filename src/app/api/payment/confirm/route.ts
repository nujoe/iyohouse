import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const { paymentKey, orderId, amount, workshopId } = await request.json();

        // 1. 토스페이먼츠 결제 승인 요청
        const secretKey = "test_sk_Z61JOxRQVEaA4JKJlo7DVW0X9bAq";
        const basicToken = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');

        const confirmResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${basicToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                paymentKey,
                orderId,
                amount,
            }),
        });

        const confirmData = await confirmResponse.json();

        if (!confirmResponse.ok) {
            console.error("토스 승인 실패:", confirmData);
            return NextResponse.json({ success: false, error: confirmData.message }, { status: confirmResponse.status });
        }

        // 2. 승인 성공 시 Supabase DB에 신청 내역 저장
        // 워크숍 ID 추출 (orderId에서 파싱하거나 별도로 전달받은 값 사용)
        // 예: order_WORKSHOPID_TIMESTAMP
        const actualWorkshopId = workshopId || orderId.split('_')[1];

        const { error: dbError } = await supabase
            .from('workshop_registrations')
            .insert([{
                workshop_id: actualWorkshopId,
                order_id: orderId,
                payment_key: paymentKey,
                amount: amount,
                payment_status: 'completed',
                created_at: new Date().toISOString()
            }]);

        if (dbError) {
            console.error("Supabase 저장 실패:", dbError);
            // 결제는 성공했으나 DB 저장 실패한 경우 - 실제 운영에선 취소(Cancel) API 호출 고려
            return NextResponse.json({ success: false, error: "결제는 완료되었으나 DB 저장에 실패했습니다." }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: confirmData });

    } catch (err: any) {
        console.error("API 서버 에러:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
