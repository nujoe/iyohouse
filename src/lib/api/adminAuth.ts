import type { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseSessionClient } from '@/lib/supabase/server'
import { noStoreJson } from '@/lib/api/responses'

type AdminAccessResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

function hasValidBearerToken(request: Request) {
  const secret = process.env.ADMIN_SYNC_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  return Boolean(token && token === secret)
}

export async function verifyAdminAccess(request: Request): Promise<AdminAccessResult> {
  if (hasValidBearerToken(request)) return { ok: true }

  try {
    const supabase = await createSupabaseSessionClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return {
        ok: false,
        response: noStoreJson(
          { success: false, error: 'Unauthorized - admin session or Bearer token is required.' },
          { status: 401 },
        ),
      }
    }

    const supabaseAdmin = getSupabaseServerClient()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_super_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile?.is_super_admin) {
      return {
        ok: false,
        response: noStoreJson(
          { success: false, error: 'Forbidden - super admin access is required.' },
          { status: 403 },
        ),
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      response: noStoreJson(
        { success: false, error: 'Admin authorization failed.' },
        { status: 401 },
      ),
    }
  }
}
