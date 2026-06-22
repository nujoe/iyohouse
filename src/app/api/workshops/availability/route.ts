import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function isActiveRegistration(row: { status?: string | null; expires_at?: string | null }) {
  if (row.status === 'confirmed') return true
  if (row.status !== 'pending') return false
  if (!row.expires_at) return false

  return new Date(row.expires_at).getTime() > Date.now()
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('workshop_registrations_v2')
      .select('workshop_id, schedule_key, status, expires_at')
      .in('status', ['confirmed', 'pending'])

    if (error) throw error

    const availability = (data || []).reduce<{
      counts: Record<string, number>
      scheduleCounts: Record<string, Record<string, number>>
    }>((acc, row) => {
      if (!isActiveRegistration(row)) return acc
      if (typeof row.workshop_id !== 'string' || !row.workshop_id) return acc

      acc.counts[row.workshop_id] = (acc.counts[row.workshop_id] || 0) + 1

      if (typeof row.schedule_key === 'string' && row.schedule_key.trim()) {
        const scheduleKey = row.schedule_key.trim()
        acc.scheduleCounts[row.workshop_id] = acc.scheduleCounts[row.workshop_id] || {}
        acc.scheduleCounts[row.workshop_id][scheduleKey] =
          (acc.scheduleCounts[row.workshop_id][scheduleKey] || 0) + 1
      }

      return acc
    }, { counts: {}, scheduleCounts: {} })

    return NextResponse.json({ success: true, ...availability })
  } catch (error) {
    console.error('Workshop availability API error:', error)
    return NextResponse.json({ success: false, counts: {}, scheduleCounts: {} })
  }
}
