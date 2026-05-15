import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  try {
    const { registration_id } = await request.json()
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

    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const serviceRoleClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: updateError } = await serviceRoleClient
      .from('workshop_registrations_v2')
      .update({ status: 'cancelled' })
      .eq('id', registration_id)

    if (updateError) {
      console.error('취소 업데이트 에러:', updateError)
      return NextResponse.json({ success: false, error: '상태 업데이트 중 에러가 발생했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Fail API Error:', errMsg)
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 })
  }
}
