import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  try {
    const { registration_id, checkout_attempt_id } = await request.json()
    const checkoutAttemptId = typeof checkout_attempt_id === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkout_attempt_id)
      ? checkout_attempt_id
      : null

    if (checkout_attempt_id != null && !checkoutAttemptId) {
      return NextResponse.json({ success: false, error: '결제 시도 ID가 올바르지 않습니다.' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (!user || authError) {
      return NextResponse.json({ success: false, error: '인증되지 않은 사용자입니다.' }, { status: 401 })
    }

    const { data: registration, error: regError } = await supabase
      .from('workshop_registrations_v2')
      .select('*')
      .eq('id', registration_id)
      .single()

    if (regError || !registration) {
      return NextResponse.json({ success: false, error: '신청 내역을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (registration.user_id !== user.id) {
      return NextResponse.json({ success: false, error: '본인의 신청 내역만 수정할 수 있습니다.' }, { status: 403 })
    }

    if (registration.status !== 'pending') {
      return NextResponse.json({ success: true, message: '이미 처리된 신청입니다.' })
    }

    const serviceRoleClient = getSupabaseServerClient()
    const { data: releaseResult, error: releaseError } = await serviceRoleClient.rpc(
      'release_virtual_account_checkout',
      {
        p_registration_id: registration.id,
        p_user_id: user.id,
        p_attempt_id: checkoutAttemptId,
      },
    )

    if (
      releaseError
      || (
        releaseResult !== 'preserved'
        && releaseResult !== 'cancelled'
        && releaseResult !== 'expired'
        && releaseResult !== 'unchanged'
        && releaseResult !== 'stale_attempt'
      )
    ) {
      console.error('가상계좌 결제 정리 RPC 에러:', {
        registrationId: registration.id,
        outcome: releaseResult,
        hasError: Boolean(releaseError),
      })
      return NextResponse.json({ success: false, error: '상태 업데이트 중 에러가 발생했습니다.' }, { status: 500 })
    }

    if (releaseResult === 'stale_attempt') {
      return NextResponse.json(
        { success: false, error: '현재 결제 시도와 일치하지 않습니다.' },
        { status: 409 },
      )
    }

    if (releaseResult === 'preserved') {
      return NextResponse.json({
        success: true,
        pending: true,
        order_id: registration.order_id,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Fail API Error:', errMsg)
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 })
  }
}
