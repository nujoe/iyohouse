import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseSessionClient } from "@/lib/supabase/server";

function hasValidBearerToken(request: Request) {
  const secret = process.env.ADMIN_SYNC_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  return Boolean(token && token === secret);
}

export async function verifyAdminAccess(
  request: Request,
): Promise<{ ok: true; userId: string | null } | { ok: false; response: NextResponse }> {
  if (hasValidBearerToken(request)) {
    return { ok: true, userId: null };
  }

  try {
    const supabase = await createSupabaseSessionClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: "Unauthorized - admin session or Bearer token is required." },
          { status: 401 },
        ),
      };
    }

    const supabaseAdmin = getSupabaseServerClient();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.is_super_admin) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: "Forbidden - super admin access is required." },
          { status: 403 },
        ),
      };
    }

    return { ok: true, userId: user.id };
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Admin auth failed." },
        { status: 401 },
      ),
    };
  }
}
