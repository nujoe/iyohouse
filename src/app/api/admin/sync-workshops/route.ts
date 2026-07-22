import { NextRequest } from 'next/server'
import { verifyAdminAccess } from '@/lib/api/adminAuth'
import { noStoreJson } from '@/lib/api/responses'
import { syncSanityWorkshopRuntime } from '@/lib/admin/syncWorkshopRuntime'

type SyncRequestBody = {
  documentId?: string
}

async function parseSyncRequestBody(request: NextRequest): Promise<SyncRequestBody> {
  const contentType = request.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) return {}

  return request.json().catch(() => ({}))
}

export function GET() {
  return noStoreJson(
    { success: false, error: 'Method Not Allowed. Use POST.' },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess(request)
  if (!auth.ok) return auth.response

  try {
    const body = await parseSyncRequestBody(request)
    const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : ''
    const results = await syncSanityWorkshopRuntime({ documentId, preferDraft: true })

    if (documentId && results.total === 0) {
      return noStoreJson(
        { success: false, error: 'Sanity workshop document was not found.', results },
        { status: 404 },
      )
    }

    return noStoreJson({
      success: true,
      message: 'Synchronization completed',
      results,
    })
  } catch (error: unknown) {
    console.error('Workshop sync failed:', error)
    return noStoreJson({
      success: false,
      error: 'Workshop sync failed',
    }, { status: 500 })
  }
}
