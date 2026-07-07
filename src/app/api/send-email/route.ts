import { Resend } from 'resend'
import { noStoreJson } from '@/lib/api/responses'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const MAX_CONTACT_BODY_BYTES = 8 * 1024
const HONEYPOT_FIELDS = ['company', 'website', 'url', 'homepage']
const attempts = new Map<string, { count: number; resetAt: number }>()

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  return forwardedFor?.split(',')[0]?.trim() || 'unknown'
}

function isRateLimited(key: string) {
  const now = Date.now()

  // 1. Periodic cleanup if the map gets too large
  // This prevents memory exhaustion from unique IP brute-forcing
  if (attempts.size > 1000) {
    for (const [k, v] of attempts.entries()) {
      if (v.resetAt <= now) {
        attempts.delete(k)
      }
    }
  }

  const current = attempts.get(key)

  // 2. On-access cleanup: If expired, reset or delete
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  current.count += 1
  return current.count > RATE_LIMIT_MAX
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function readContactBody(request: Request) {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) return null

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).length > MAX_CONTACT_BODY_BYTES) return null

  try {
    const parsed = JSON.parse(rawBody)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function hasHoneypotValue(body: Record<string, unknown>) {
  return HONEYPOT_FIELDS.some((field) => readString(body[field]).length > 0)
}

export async function POST(request: Request) {
  try {
    const clientKey = getClientKey(request)
    if (isRateLimited(clientKey)) {
      return noStoreJson({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const body = await readContactBody(request)
    if (!body || hasHoneypotValue(body)) {
      return noStoreJson({ success: false, error: 'Invalid contact request' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not defined')
      return noStoreJson({ success: false, error: 'Email service not configured' }, { status: 500 })
    }

    const email = readString(body.email)
    const subject = readString(body.subject)
    const message = readString(body.message)

    if (!isValidEmail(email) || message.length < 1 || message.length > 3000 || subject.length > 200) {
      return noStoreJson({ success: false, error: 'Invalid contact request' }, { status: 400 })
    }

    const resend = new Resend(apiKey)
    const safeSubject = subject.replace(/[\r\n]+/g, ' ') || '문의'
    const { data, error } = await resend.emails.send({
      from: process.env.CONTACT_EMAIL_FROM || 'IYOHOUSE Contact <onboarding@resend.dev>',
      to: [process.env.CONTACT_EMAIL_TO || 'goyangiyoram@gmail.com'],
      replyTo: email,
      subject: `[IYOHOUSE Inquiry] ${safeSubject}`,
      html: `
        <h2>New inquiry has arrived.</h2>
        <p><strong>From:</strong> ${escapeHtml(email)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(safeSubject)}</p>
        <p><strong>Message:</strong></p>
        <div style="padding: 15px; background: #f5f5f5; border-radius: 5px;">
          ${escapeHtml(message).replace(/\n/g, '<br/>')}
        </div>
      `,
    })

    if (error) {
      console.error('Resend error:', error)
      return noStoreJson({ success: false, error: 'Email delivery failed' }, { status: 502 })
    }

    return noStoreJson({ success: true, data })
  } catch (error) {
    console.error('Contact API error:', error)
    return noStoreJson({ success: false, error: 'Unable to send email' }, { status: 500 })
  }
}
