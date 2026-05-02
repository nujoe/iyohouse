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

async function getRegistrationCounts() {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('workshop_registrations_v2')
      .select('workshop_id')
      .eq('status', 'confirmed')

    if (error) throw error

    return (data || []).reduce<Record<string, number>>((acc, registration) => {
      if (typeof registration.workshop_id === 'string' && registration.workshop_id) {
        acc[registration.workshop_id] = (acc[registration.workshop_id] || 0) + 1
      }

      return acc
    }, {})
  } catch (error) {
    console.error('Workshop counts fetch failed:', error)
    return {}
  }
}

export async function GET() {
  try {
      const [workshops, events, counts] = await Promise.all([
      sanityServerClient.fetch(`*[_type == "workshop"] | order(number desc) {
        ...,
        supabase_workshop_id,
        "posterMeta": poster.asset->metadata.dimensions
      }`),
      sanityServerClient.fetch(`*[_type == "event"] | order(date asc)`),
      getRegistrationCounts(),
    ])

    return NextResponse.json({
      success: true,
      workshops,
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
