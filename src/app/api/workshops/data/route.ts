import { NextResponse } from 'next/server'
import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from '@/sanity/env'
import { getSupabaseServerClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const sanityServerClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
})

type WorkshopRuntimeData = {
  id: string
  price: number
  capacity: number
  status: string | null
}

async function getRegistrationCounts() {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('workshop_registration_counts')
      .select('workshop_id, confirmed_count')

    if (error) throw error

    return (data || []).reduce<Record<string, number>>((acc, row) => {
      if (typeof row.workshop_id === 'string' && row.workshop_id) {
        acc[row.workshop_id] = Number(row.confirmed_count)
      }

      return acc
    }, {})
  } catch (error) {
    console.error('Workshop counts fetch failed:', error)
    return {}
  }
}

async function getWorkshopRuntimeData(workshopIds: string[]) {
  if (workshopIds.length === 0) return {}

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('workshops')
      .select('id, price, capacity, status')
      .in('id', workshopIds)

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
    const [workshops, events, counts] = await Promise.all([
      sanityServerClient.fetch(`*[_type == "workshop"] | order(number desc) {
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
          timeEn
        },
        supabase_workshop_id,
        "posterMeta": poster.asset->metadata.dimensions
      }`),
      sanityServerClient.fetch(`*[_type == "event"] | order(date asc)`),
      getRegistrationCounts(),
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
        isClosed: runtime.status !== 'active',
        supabase_status: runtime.status,
      }
    })

    return NextResponse.json({
      success: true,
      workshops: mergedWorkshops,
      events,
      counts,
    })
  } catch (error) {
    console.error('Workshop data API error:', error)

    return NextResponse.json(
      {
        success: false,
        workshops: [],
        events: [],
        counts: {},
        error: 'Unable to load workshop data',
      },
      { status: 500 }
    )
  }
}
