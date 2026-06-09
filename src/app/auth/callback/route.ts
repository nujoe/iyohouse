import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function getSafeNextPath(requestedNext: string | null) {
  if (!requestedNext?.startsWith('/') || requestedNext.startsWith('//') || requestedNext.startsWith('/\\')) return '/'

  try {
    const parsed = new URL(requestedNext, 'https://iyohouse.local')
    if (parsed.origin !== 'https://iyohouse.local') return '/'
    if (
      parsed.pathname === '/auth' ||
      parsed.pathname.startsWith('/auth/') ||
      parsed.pathname === '/complete-profile' ||
      parsed.pathname.startsWith('/complete-profile/')
    ) return '/'

    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

function getRedirectBase(request: Request, origin: string) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'

  if (isLocalEnv) return origin
  if (forwardedHost) return `https://${forwardedHost}`

  return origin
}

function hasCompletedProfile(
  profile: { completed_at: string | null } | null
) {
  return Boolean(profile?.completed_at)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = getSafeNextPath(searchParams.get('next'))
  const base = getRedirectBase(request, origin)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('completed_at')
          .eq('id', user.id)
          .maybeSingle()

        if (!hasCompletedProfile(profile)) {
          return NextResponse.redirect(`${base}/complete-profile?next=${encodeURIComponent(next)}`)
        }
      }

      return NextResponse.redirect(`${base}${next}`)
    }
  }

  return NextResponse.redirect(`${base}/auth/auth-code-error`)
}
