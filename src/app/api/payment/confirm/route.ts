import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
    const supabase = await createClient();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ success: false, error: "서버 설정 오류: 환경 변수 누락 (URL 또는 SERVICE_ROLE_KEY)" }, { status: 500 });
    }
    
    const serviceRoleClient = createSupabaseClient(
        supabaseUrl,
        serviceRoleKey
    );
    
    try {
        const { paymentKey, orderId, amount, registration_id } = await request.json();

        // 0. 사용자 세션 확인 (Server-side)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!user || authError) {
            return NextResponse.json({ success: false, error: "인증되지 않은 사용자입니다." }, { status: 401 });
        }

        // 1. 신청 내역 조회 및 검증 (V2 테이블)
        const { data: registration, error: regError } = await supabase
            .from('workshop_registrations_v2')
            .select('*')
            .eq('id', registration_id)
            .single();

        if (regError || !registration) {
            return NextResponse.json({ success: false, error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
        }

        // 신청자 본인 확인
        if (registration.user_id !== user.id) {
            return NextResponse.json({ success: false, error: "본인의 신청 내역만 결제할 수 있습니다." }, { status: 403 });
        }

        // 취소/만료된 신청 확인
        if (registration.status === 'cancelled' || registration.status === 'expired') {
            return NextResponse.json({ success: false, error: "유효하지 않은 신청입니다." }, { status: 400 });
        }

        // 이미 완료된 결제인지 확인 (Idempotency)
        if (registration.status === 'confirmed') {
            const { data: paymentRecord, error: paymentError } = await supabase
                .from('payments')
                .select('*')
                .eq('registration_id', registration_id)
                .single();

            if (paymentError || !paymentRecord) {
                return NextResponse.json({ success: false, error: "결제 기록을 찾을 수 없습니다." }, { status: 409 });
            }

            if (
                paymentRecord.payment_key === paymentKey &&
                paymentRecord.order_id === orderId &&
                Number(paymentRecord.amount) === Number(amount)
            ) {
                return NextResponse.json({ success: true, message: "이미 승인된 결제입니다." });
            } else {
                return NextResponse.json({ success: false, error: "결제 정보가 일치하지 않습니다." }, { status: 409 });
            }
        }

        // 상태가 pending이 아닌 경우 방어 코드 (위에서 confirmed, cancelled, expired를 걸렀지만 만약을 대비)
        if (registration.status !== 'pending') {
            return NextResponse.json({ success: false, error: "신청이 진행 중인 상태가 아닙니다." }, { status: 400 });
        }

        // order_id 검증
        if (registration.order_id !== orderId) {
            return NextResponse.json({ success: false, error: "주문 정보가 일치하지 않습니다." }, { status: 400 });
        }

        // 금액 검증
        if (Number(registration.amount) !== Number(amount)) {
            return NextResponse.json({ success: false, error: "결제 금액이 일치하지 않습니다." }, { status: 400 });
        }

        // 2. 토스페이먼츠 결제 승인 요청
        const secretKey = process.env.TOSS_SECRET_KEY;
        if (!secretKey) {
            console.error("TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.");
            return NextResponse.json({ success: false, error: "서버 설정 오류" }, { status: 500 });
        }
        
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

        // 3. 승인 성공 시 RPC로 상태 전환 (confirmed + 결제 기록)
        const { error: rpcError } = await serviceRoleClient.rpc('confirm_payment_registration', {
            p_registration_id: registration_id,
            p_payment_key: paymentKey,
            p_order_id: orderId,
            p_amount: Number(amount),
        });

        if (rpcError) {
            console.error("RPC 호출 실패:", rpcError);
            
            // [보상 처리 전략] 결제는 성공했으나 DB 업데이트에 실패한 경우 -> 결제 취소 호출
            try {
                await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${basicToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        cancelReason: "DB 업데이트 실패로 인한 자동 취소",
                    }),
                });
            } catch (cancelErr) {
                console.error("보상 취소 요청 중 에러:", cancelErr);
            }

            return NextResponse.json({ success: false, error: "결제는 완료되었으나 시스템 오류로 인해 취소되었습니다." }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: confirmData });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error("API 서버 에러:", err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
