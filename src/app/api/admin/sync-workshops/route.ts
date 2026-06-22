import { NextRequest, NextResponse } from 'next/server'
import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from '@/sanity/env'
import { getSupabaseServerClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseSessionClient } from '@/lib/supabase/server'

const sanityWriteClient = createClient({
  projectId,
  dataset,
  apiVersion,
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
})

type SanityScheduleSession = {
  _key?: string
  date?: string
  time?: string
  capacity?: number
}

type SanityWorkshop = {
  _id: string
  _updatedAt?: string
  title?: string
  number?: number
  price?: number
  capacity?: number
  isActive?: boolean
  isClosed?: boolean
  schedule?: SanityScheduleSession[]
  supabase_workshop_id?: string
  _syncTargetIds?: string[]
}

type SyncRequestBody = {
  documentId?: string
}

function normalizeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  return Math.round(value)
}

function getFallbackStartAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

function getFallbackEndAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString()
}

function getPublishedId(id: string) {
  return id.replace(/^drafts\./, '')
}

function getDraftId(id: string) {
  return id.startsWith('drafts.') ? id : `drafts.${id}`
}

function getSyncDocumentIds(documentId: string) {
  const publishedId = getPublishedId(documentId)
  return [publishedId, getDraftId(publishedId)]
}

function getScheduleKey(session: SanityScheduleSession) {
  const explicitKey = typeof session?._key === 'string' ? session._key.trim() : ''
  if (explicitKey) return explicitKey

  return [session?.date, session?.time]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join('-')
}

function buildScheduleCapacities(schedule: SanityScheduleSession[] | undefined) {
  if (!Array.isArray(schedule)) return {}

  return schedule.reduce<Record<string, number>>((acc, session) => {
    const key = getScheduleKey(session)
    const capacity = normalizeInteger(session?.capacity)

    if (key && capacity !== null && capacity > 0) {
      acc[key] = capacity
    }

    return acc
  }, {})
}

function dedupeWorkshopsPreferDraft(workshops: SanityWorkshop[]) {
  const byPublishedId = new Map<string, SanityWorkshop>()
  const idsByPublishedId = new Map<string, string[]>()
  const supabaseIdByPublishedId = new Map<string, string>()

  for (const workshop of workshops) {
    const publishedId = getPublishedId(workshop._id)
    const existing = byPublishedId.get(publishedId)
    const isDraft = workshop._id.startsWith('drafts.')
    const existingIsDraft = existing?._id.startsWith('drafts.')
    const targetIds = idsByPublishedId.get(publishedId) || []

    if (!targetIds.includes(workshop._id)) {
      targetIds.push(workshop._id)
      idsByPublishedId.set(publishedId, targetIds)
    }

    if (workshop.supabase_workshop_id) {
      supabaseIdByPublishedId.set(publishedId, workshop.supabase_workshop_id)
    }

    if (!existing || (isDraft && !existingIsDraft)) {
      byPublishedId.set(publishedId, workshop)
    }
  }

  return Array.from(byPublishedId.entries()).map(([publishedId, workshop]) => ({
    ...workshop,
    supabase_workshop_id: workshop.supabase_workshop_id || supabaseIdByPublishedId.get(publishedId),
    _syncTargetIds: idsByPublishedId.get(publishedId) || [workshop._id],
  }))
}

async function patchWorkshopDbId(documentIds: string[], supabaseWorkshopId: string) {
  const transaction = sanityWriteClient.transaction()

  for (const documentId of documentIds) {
    transaction.patch(documentId, (patch) =>
      patch.set({ supabase_workshop_id: supabaseWorkshopId }),
    )
  }

  return transaction.commit()
}

async function parseSyncRequestBody(request: NextRequest): Promise<SyncRequestBody> {
  const contentType = request.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) return {}

  return request.json().catch(() => ({}))
}

function hasValidBearerToken(request: NextRequest) {
  const secret = process.env.ADMIN_SYNC_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  return Boolean(token && token === secret)
}

// ---------------------------------------------------------------------------
// Auth helper – allows server token or active Supabase super admin session.
// ---------------------------------------------------------------------------
async function verifyAdminAccess(request: NextRequest):
  Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (hasValidBearerToken(request)) return { ok: true }

  try {
    const supabase = await createSupabaseSessionClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'Unauthorized – admin session or Bearer token is required.' },
          { status: 401 },
        ),
      }
    }

    const supabaseAdmin = getSupabaseServerClient()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, is_super_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile?.is_super_admin) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            error: 'Forbidden – super admin access is required.',
            authUser: {
              id: user.id,
              email: user.email ?? null,
            },
            profile: profile
              ? {
                  id: profile.id,
                  email: profile.email,
                  is_super_admin: profile.is_super_admin,
                }
              : null,
            profileError: profileError?.message ?? null,
          },
          { status: 403 },
        ),
      }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Admin auth failed.' },
        { status: 401 },
      ),
    }
  }
}

// ---------------------------------------------------------------------------
// GET is no longer allowed – return 405 Method Not Allowed
// ---------------------------------------------------------------------------
export function GET() {
  return NextResponse.json(
    { success: false, error: 'Method Not Allowed. Use POST.' },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

// ---------------------------------------------------------------------------
// POST /api/admin/sync-workshops  (protected)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess(request)
  if (!auth.ok) return auth.response

  try {
    const body = await parseSyncRequestBody(request)
    const supabase = getSupabaseServerClient()
    const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : ''
    const documentIds = documentId ? getSyncDocumentIds(documentId) : []
    const query = documentId
      ? `*[_type == "workshop" && _id in $documentIds] {
          _id,
          _updatedAt,
          title,
          number,
          price,
          capacity,
          isActive,
          isClosed,
          schedule[]{
            _key,
            date,
            time,
            capacity
          },
          supabase_workshop_id
        }`
      : `*[_type == "workshop"] {
          _id,
          _updatedAt,
          title,
          number,
          price,
          capacity,
          isActive,
          isClosed,
          schedule[]{
            _key,
            date,
            time,
            capacity
          },
          supabase_workshop_id
        }`

    const sanityWorkshops = dedupeWorkshopsPreferDraft(
      await sanityWriteClient.fetch<SanityWorkshop[]>(query, { documentIds }),
    )

    const results = {
      total: sanityWorkshops.length,
      created: 0,
      updated: 0,
      skipped: 0,
      syncedIds: [] as string[],
      patchedSanityIds: [] as string[],
      warnings: [] as string[],
      errors: [] as string[],
    }

    if (documentId && sanityWorkshops.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Sanity workshop document was not found.', results },
        { status: 404 },
      )
    }

    for (const ws of sanityWorkshops) {
      const price = normalizeInteger(ws.price)
      const capacity = normalizeInteger(ws.capacity)
      const title = ws.title || `Workshop #${ws.number || ws._id}`
      const hasValidPrice = price !== null && price >= 0
      const hasValidCapacity = capacity !== null && capacity > 0
      const scheduleCapacities = buildScheduleCapacities(ws.schedule)
      const status = ws.isActive === false ? 'inactive' : ws.isClosed ? 'closed' : 'active'

      if (!hasValidPrice) {
        results.errors.push(`${title}: Sanity price is required and must be 0 or greater.`)
        results.skipped++
        continue
      }

      const workshopPayload = {
        title,
        description: `Sanity Workshop #${ws.number || ws._id}`,
        price,
        status,
        schedule_capacities: scheduleCapacities,
      }
      const updatePayload = {
        ...workshopPayload,
        ...(hasValidCapacity ? { capacity } : {}),
      }

      if (!hasValidCapacity) {
        results.warnings.push(`${title}: Sanity capacity is empty, so Supabase capacity was kept unchanged.`)
      }

      if (ws.supabase_workshop_id) {
        const { data: updatedWs, error: updateError } = await supabase
          .from('workshops')
          .update(updatePayload)
          .eq('id', ws.supabase_workshop_id)
          .select('id')
          .maybeSingle()

        if (updateError) {
          results.errors.push(`Supabase update error for ${title}: ${updateError.message}`)
          continue
        }

        if (updatedWs) {
          try {
            const targetIds = ws._syncTargetIds?.length ? ws._syncTargetIds : [ws._id]
            await patchWorkshopDbId(targetIds, updatedWs.id)
            results.patchedSanityIds.push(...targetIds)
          } catch (sanityError: any) {
            results.errors.push(`Sanity patch error for ${title}: ${sanityError.message}`)
          }

          results.updated++
          results.syncedIds.push(updatedWs.id)
          continue
        }
      }

      if (!hasValidCapacity) {
        results.errors.push(`${title}: Sanity capacity is required before creating a Supabase workshop.`)
        results.skipped++
        continue
      }

      const { data: newWs, error: sbError } = await supabase
        .from('workshops')
        .insert({
          ...workshopPayload,
          capacity,
          start_at: getFallbackStartAt(),
          end_at: getFallbackEndAt(),
        })
        .select()
        .single()

      if (sbError) {
        results.errors.push(`Supabase insert error for ${title}: ${sbError.message}`)
        continue
      }

      try {
        const targetIds = ws._syncTargetIds?.length ? ws._syncTargetIds : [ws._id]
        await patchWorkshopDbId(targetIds, newWs.id)

        results.created++
        results.syncedIds.push(newWs.id)
        results.patchedSanityIds.push(...targetIds)
      } catch (sanityError: any) {
        results.errors.push(`Sanity patch error for ${title}: ${sanityError.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Synchronization completed',
      results,
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}
