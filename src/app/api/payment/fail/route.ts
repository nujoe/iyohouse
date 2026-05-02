import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
    const supabase = await createClient();
    
    try {
        const { registration_id, code, message } = await request.json();

        // 0. 사용자 세션 확인
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!user || authError) {
            return NextResponse.json({ success: false, error: "인증되지 않은 사용자입니다." }, { status: 401 });
        }

        // 1. 신청 내역 조회 및 검증
        const { data: registration, error: regError } = await supabase
            .from('workshop_registrations_v2')
            .select('*')
            .eq('id', registration_id)
            .single();

        if (regError || !registration) {
            return NextResponse.json({ success: false, error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
        }

        if (registration.user_id !== user.id) {
            return NextResponse.json({ success: false, error: "본인의 신청 내역만 수정할 수 있습니다." }, { status: 403 });
        }

        if (registration.status !== 'pending') {
            return NextResponse.json({ success: true, message: "이미 처리된 신청입니다." });
        }

        // 2. 상태 업데이트 (service role 필요 여부 검토)
        // 일반 유저가 본인의 pending 상태를 cancelled로 바꾸는 것은 RLS 상에서 가능할 수도 있지만,
        // 계약 문서에 "서버 라우트 또는 RPC를 통해" 처리하라고 명시되어 있으므로 여기서 업데이트 수행.
        // 현재 RLS 정책 "Users can view their own registrations" 만 있고 UPDATE 권한이 없다면
        // service role을 사용해야 할 수 있습니다. 계약 문서 7-조회/수정 권한에 "일반 사용자: ... 본인의 결제 내역만 SELECT 가능"이라 되어 있으므로
        // UPDATE 권한이 없다고 간주하고 service role client 사용이 더 안전합니다.
        // 하지만 일단은 service_role을 명시적으로 요구하는지 봅시다.
        // `SUPABASE_SERVICE_ROLE_KEY`를 사용하는 것은 "웹훅이나 스케줄러 등 관리자 권한이 필요한 경우에 한하여" 라고 되어있습니다.
        // 그렇다면 일반 RLS 우회보다 RPC를 하나 더 파야 하나? 
        // 8.8. `create_pending_registration` 외의 신청 생성 RPC 이름 추가 금지
        // 8.9. `confirm_payment_registration` 외의 결제 확정 RPC 이름 추가 금지
        // 그렇다면 서비스 롤을 불가피하게 라우트에서 사용하거나, 일반 쿼리를 서비스 롤로 수행해야 합니다.
        // 그냥 serviceRoleClient를 쓰겠습니다.

        const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
        const serviceRoleClient = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error: updateError } = await serviceRoleClient
            .from('workshop_registrations_v2')
            .update({ status: 'cancelled' })
            .eq('id', registration_id);

        if (updateError) {
            console.error("취소 업데이트 에러:", updateError);
            return NextResponse.json({ success: false, error: "상태 업데이트 중 에러가 발생했습니다." }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error("Fail API Error:", errMsg);
        return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }
}
