import { NextRequest } from 'next/server'
import { parseBody } from 'next-sanity/webhook'
import { noStoreJson } from '@/lib/api/responses'
import { syncSanityWorkshopRuntime } from '@/lib/admin/syncWorkshopRuntime'
import { dataset, projectId } from '@/sanity/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SanityWebhookWorkshop = {
  _id?: string
  _type?: string
}

function isExpectedSanitySource(request: NextRequest) {
  return request.headers.get('sanity-project-id') === projectId
    && request.headers.get('sanity-dataset') === dataset
}

export async function POST(request: NextRequest) {
  const secret = process.env.SANITY_WEBHOOK_SECRET

  if (!secret) {
    console.error('Sanity workshop publish webhook is not configured.')
    return noStoreJson({ success: false, error: 'Webhook is not configured.' }, { status: 503 })
  }

  try {
    const { body, isValidSignature } = await parseBody<SanityWebhookWorkshop>(request, secret)

    if (!isValidSignature || !body) {
      return noStoreJson({ success: false, error: 'Invalid webhook signature.' }, { status: 401 })
    }

    const operation = request.headers.get('sanity-operation')
    const documentId = typeof body._id === 'string' ? body._id.trim() : ''

    if (!isExpectedSanitySource(request) || operation === 'delete' || body._type !== 'workshop' || !documentId) {
      return new Response(null, { status: 204 })
    }

    const results = await syncSanityWorkshopRuntime({
      documentId,
      preferDraft: false,
    })

    if (results.validationFailed) {
      return noStoreJson({ success: false, error: results.errors.join('\n') }, { status: 422 })
    }

    if (results.errors.length > 0 || results.total !== 1) {
      console.error('Sanity workshop publish sync failed:', {
        documentId,
        idempotencyKey: request.headers.get('idempotency-key'),
        errors: results.errors,
      })
      return noStoreJson({ success: false, error: 'Workshop runtime sync failed.' }, { status: 500 })
    }

    return noStoreJson({
      success: true,
      created: results.created,
      updated: results.updated,
    })
  } catch (error: unknown) {
    console.error('Sanity workshop publish webhook failed:', error)
    return noStoreJson({ success: false, error: 'Webhook processing failed.' }, { status: 500 })
  }
}
