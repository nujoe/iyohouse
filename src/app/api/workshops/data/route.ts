import { NextResponse } from 'next/server'
import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from '@/sanity/env'
import { getSupabaseServerClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const sanityServerClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
})

type WorkshopRuntimeData = {
  id: string
  price: number
  capacity: number
  status: string | null
  schedule_capacities?: Record<string, number> | null
}

type RegistrationAvailability = {
  counts: Record<string, number>
  scheduleCounts: Record<string, Record<string, number>>
}

function isActiveRegistration(row: { status?: string | null; expires_at?: string | null }) {
  if (row.status === 'confirmed') return true
  if (row.status !== 'pending') return false
  if (!row.expires_at) return false

  return new Date(row.expires_at).getTime() > Date.now()
}

async function getRegistrationAvailability(): Promise<RegistrationAvailability> {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('workshop_registrations_v2')
      .select('workshop_id, schedule_key, status, expires_at')
      .in('status', ['confirmed', 'pending'])

    if (error) throw error

    return (data || []).reduce<RegistrationAvailability>((acc, row) => {
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
  } catch (error) {
    console.error('Workshop availability fetch failed:', error)
    return { counts: {}, scheduleCounts: {} }
  }
}

async function getWorkshopRuntimeData(workshopIds: string[]) {
  if (workshopIds.length === 0) return {}

  try {
    const supabase = getSupabaseServerClient()
    const primary = await supabase
      .from('workshops')
      .select('id, price, capacity, status, schedule_capacities')
      .in('id', workshopIds)
    let data = primary.data as WorkshopRuntimeData[] | null
    let error = primary.error

    if (error && String(error.message || '').includes('schedule_capacities')) {
      const fallback = await supabase
        .from('workshops')
        .select('id, price, capacity, status')
        .in('id', workshopIds)

      data = fallback.data as WorkshopRuntimeData[] | null
      error = fallback.error
    }

    if (error) throw error

    return (data || []).reduce<Record<string, WorkshopRuntimeData>>((acc, workshop) => {
      if (typeof workshop.id === 'string') {
        acc[workshop.id] = workshop as WorkshopRuntimeData
      }

      return acc
    }, {})
  } catch (error) {
    console.error('Workshop runtime data fetch failed:', error)
    return {}
  }
}

export async function GET() {
  try {
    const [workshops, events, availability] = await Promise.all([
      sanityServerClient.fetch(`*[_type == "workshop" && isActive != false] | order(number desc) {
        ...,
        titleEn,
        tutorEn,
        tutorBioEn,
        descriptionEn,
        curriculum[]{
          ...,
          weekLabelEn,
          contentEn
        },
        schedule[]{
          ...,
          dateEn,
          timeEn,
          capacity
        },
        supabase_workshop_id,
        "posterMeta": poster.asset->metadata.dimensions
      }`),
      sanityServerClient.fetch(`*[_type == "event"] | order(date asc)`),
      getRegistrationAvailability(),
    ])

    const workshopIds = workshops
      .map((workshop: any) => workshop.supabase_workshop_id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)

    const runtimeData = await getWorkshopRuntimeData(workshopIds)
    const mergedWorkshops = workshops.map((workshop: any) => {
      const runtime = runtimeData[workshop.supabase_workshop_id]

      if (!runtime) return workshop

      return {
        ...workshop,
        price: runtime.price,
        capacity: runtime.capacity,
        scheduleCapacities: runtime.schedule_capacities || {},
        isClosed: runtime.status !== 'active',
        supabase_status: runtime.status,
      }
    })

    return NextResponse.json({
      success: true,
      workshops: mergedWorkshops,
      events,
      counts: availability.counts,
      scheduleCounts: availability.scheduleCounts,
    })
  } catch (error) {
    console.error('Workshop data API error:', error)

    return NextResponse.json(
      {
        success: false,
        workshops: [],
        events: [],
        counts: {},
        scheduleCounts: {},
        error: 'Unable to load workshop data',
      },
      { status: 500 }
    )
  }
}
