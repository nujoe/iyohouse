import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('workshop_registrations_v2')
      .select('workshop_id')
      .eq('status', 'confirmed')

    if (error) throw error

    const counts = (data || []).reduce<Record<string, number>>((acc, registration) => {
      if (typeof registration.workshop_id === 'string' && registration.workshop_id) {
        acc[registration.workshop_id] = (acc[registration.workshop_id] || 0) + 1
      }

      return acc
    }, {})

    return NextResponse.json({ success: true, counts })
  } catch (error) {
    console.error('Workshop availability API error:', error)
    return NextResponse.json({ success: false, counts: {} })
  }
}
