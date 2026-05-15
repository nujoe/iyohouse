import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function getSafeNextPath(requestedNext: string | null) {
  if (!requestedNext?.startsWith('/') || requestedNext.startsWith('//')) return '/'
  if (requestedNext.startsWith('/auth') || requestedNext.startsWith('/complete-profile')) return '/'

  return requestedNext
}

function getRedirectBase(request: Request, origin: string) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'

  if (isLocalEnv) return origin
  if (forwardedHost) return `https://${forwardedHost}`

  return origin
}

function hasCompletedProfile(
  profile: { full_name: string | null; phone: string | null; email: string | null } | null,
  userEmail?: string | null
) {
  return Boolean(
    profile?.full_name?.trim() &&
    profile?.phone?.trim() &&
    (profile?.email || userEmail)?.trim()
  )
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = getSafeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const base = getRedirectBase(request, origin)
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone, email')
          .eq('id', user.id)
          .maybeSingle()

        if (!hasCompletedProfile(profile, user.email)) {
          return NextResponse.redirect(`${base}/complete-profile?next=${encodeURIComponent(next)}`)
        }
      }

      return NextResponse.redirect(`${base}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
