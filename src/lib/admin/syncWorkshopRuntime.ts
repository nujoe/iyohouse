import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from '@/sanity/env'
import { getSupabaseServerClient } from '@/lib/supabase/admin'
import { parseCapacity } from '@/lib/workshopUtils'

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
  studentPrice?: number
  capacity?: string | number
  isActive?: boolean
  isClosed?: boolean
  schedule?: SanityScheduleSession[]
  supabase_workshop_id?: string
  _syncTargetIds?: string[]
}

export type WorkshopRuntimeSyncResult = {
  total: number
  created: number
  updated: number
  skipped: number
  syncedIds: string[]
  patchedSanityIds: string[]
  warnings: string[]
  errors: string[]
  validationFailed: boolean
}

type WorkshopRuntimeSyncOptions = {
  documentId?: string
  preferDraft?: boolean
}

const sanityWriteClient = createClient({
  projectId,
  dataset,
  apiVersion,
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
})

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

function getSyncDocumentIds(documentId: string, preferDraft: boolean) {
  const publishedId = getPublishedId(documentId)

  return preferDraft ? [publishedId, getDraftId(publishedId)] : [publishedId]
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

function createResults(total: number): WorkshopRuntimeSyncResult {
  return {
    total,
    created: 0,
    updated: 0,
    skipped: 0,
    syncedIds: [],
    patchedSanityIds: [],
    warnings: [],
    errors: [],
    validationFailed: false,
  }
}

export async function syncSanityWorkshopRuntime({
  documentId,
  preferDraft = true,
}: WorkshopRuntimeSyncOptions = {}): Promise<WorkshopRuntimeSyncResult> {
  const trimmedDocumentId = typeof documentId === 'string' ? documentId.trim() : ''
  const documentIds = trimmedDocumentId ? getSyncDocumentIds(trimmedDocumentId, preferDraft) : []
  const query = trimmedDocumentId
    ? `*[_type == "workshop" && _id in $documentIds] {
        _id,
        _updatedAt,
        title,
        number,
        price,
        studentPrice,
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
        studentPrice,
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
  const results = createResults(sanityWorkshops.length)

  if (trimmedDocumentId && sanityWorkshops.length === 0) {
    results.errors.push('Sanity workshop document was not found.')
    return results
  }

  const supabase = getSupabaseServerClient()

  for (const workshop of sanityWorkshops) {
    const price = normalizeInteger(workshop.price)
    const studentPrice = normalizeInteger(workshop.studentPrice)
    const capacity = parseCapacity(workshop.capacity, workshop.schedule)
    const title = workshop.title || `Workshop #${workshop.number || workshop._id}`
    const hasValidPrice = price !== null && price >= 0
    const hasValidStudentPrice = studentPrice === null || studentPrice >= 0
    const hasValidCapacity = capacity !== null && capacity > 0
    const scheduleCapacities = buildScheduleCapacities(workshop.schedule)
    const status = workshop.isActive === false ? 'inactive' : workshop.isClosed ? 'closed' : 'active'

    if (!hasValidPrice) {
      results.errors.push(`${title}: Sanity price is required and must be 0 or greater.`)
      results.validationFailed = true
      results.skipped++
      continue
    }

    if (!hasValidStudentPrice) {
      results.errors.push(`${title}: Sanity studentPrice must be 0 or greater when provided.`)
      results.validationFailed = true
      results.skipped++
      continue
    }

    const workshopPayload = {
      title,
      description: `Sanity Workshop #${workshop.number || workshop._id}`,
      price,
      student_price: studentPrice,
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

    if (workshop.supabase_workshop_id) {
      const { data: updatedWorkshop, error: updateError } = await supabase
        .from('workshops')
        .update(updatePayload)
        .eq('id', workshop.supabase_workshop_id)
        .select('id')
        .maybeSingle()

      if (updateError) {
        results.errors.push(`Supabase update error for ${title}: ${updateError.message}`)
        continue
      }

      if (updatedWorkshop) {
        try {
          const targetIds = workshop._syncTargetIds?.length ? workshop._syncTargetIds : [workshop._id]
          await patchWorkshopDbId(targetIds, updatedWorkshop.id)
          results.patchedSanityIds.push(...targetIds)
        } catch (sanityError: unknown) {
          const message = sanityError instanceof Error ? sanityError.message : 'Unknown Sanity error'
          results.errors.push(`Sanity patch error for ${title}: ${message}`)
        }

        results.updated++
        results.syncedIds.push(updatedWorkshop.id)
        continue
      }
    }

    if (!hasValidCapacity) {
      results.errors.push(`${title}: Sanity capacity is required before creating a Supabase workshop.`)
      results.validationFailed = true
      results.skipped++
      continue
    }

    const { data: newWorkshop, error: createError } = await supabase
      .from('workshops')
      .insert({
        ...workshopPayload,
        capacity,
        start_at: getFallbackStartAt(),
        end_at: getFallbackEndAt(),
      })
      .select()
      .single()

    if (createError) {
      results.errors.push(`Supabase insert error for ${title}: ${createError.message}`)
      continue
    }

    try {
      const targetIds = workshop._syncTargetIds?.length ? workshop._syncTargetIds : [workshop._id]
      await patchWorkshopDbId(targetIds, newWorkshop.id)
      results.patchedSanityIds.push(...targetIds)
    } catch (sanityError: unknown) {
      const message = sanityError instanceof Error ? sanityError.message : 'Unknown Sanity error'
      results.errors.push(`Sanity patch error for ${title}: ${message}`)
    }

    results.created++
    results.syncedIds.push(newWorkshop.id)
  }

  return results
}
