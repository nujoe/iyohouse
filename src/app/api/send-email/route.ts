import { Resend } from 'resend'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const attempts = new Map<string, { count: number; resetAt: number }>()

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  return forwardedFor?.split(',')[0]?.trim() || 'unknown'
}

function isRateLimited(key: string) {
  const now = Date.now()
  const current = attempts.get(key)

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

export async function POST(request: Request) {
  try {
    const clientKey = getClientKey(request)
    if (isRateLimited(clientKey)) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not defined')
      return NextResponse.json({ success: false, error: 'Email service not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    const email = readString((body as Record<string, unknown> | null)?.email)
    const subject = readString((body as Record<string, unknown> | null)?.subject)
    const message = readString((body as Record<string, unknown> | null)?.message)

    if (!isValidEmail(email) || message.length < 1 || message.length > 3000 || subject.length > 200) {
      return NextResponse.json({ success: false, error: 'Invalid contact request' }, { status: 400 })
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
      return NextResponse.json({ success: false, error: 'Email delivery failed' }, { status: 502 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Contact API error:', error)
    return NextResponse.json({ success: false, error: 'Unable to send email' }, { status: 500 })
  }
}
