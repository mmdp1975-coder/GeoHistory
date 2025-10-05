// app/api/diag/auth/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabaseServerClient";

/**
 * Diagnostica l'autenticazione SENZA guardie/RLS:
 * - user via cookie (SSR)
 * - user via Authorization: Bearer <jwt>
 * - profilo letto con service-role (bypassa RLS)
 */
export async function GET(req: Request) {
  try {
    // 1) USER da cookie (SSR)
    const supabase = getServerSupabase();
    const { data: { user: cookieUser }, error: cookieErr } = await supabase.auth.getUser();

    // 2) USER da Authorization: Bearer <jwt>
    const auth = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

    let bearerUser: any = null;
    let bearerErr: string | null = null;
    if (token) {
      const { data, error } = await (supabaseAdmin as any).auth.getUser(token);
      bearerUser = data?.user ?? null;
      if (error) bearerErr = error.message;
    }

    // 3) PROFILE (sempre service-role → no RLS)
    let cookieProfile: any = null;
    let bearerProfile: any = null;

    if (cookieUser?.id) {
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", cookieUser.id).single();
      cookieProfile = data ?? (error ? { _error: error.message } : null);
    }
    if (bearerUser?.id) {
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", bearerUser.id).single();
      bearerProfile = data ?? (error ? { _error: error.message } : null);
    }

    return NextResponse.json({
      cookieBranch: {
        error: cookieErr?.message ?? null,
        user: cookieUser ? { id: cookieUser.id, email: cookieUser.email } : null,
        profile: cookieProfile,
      },
      bearerBranch: {
        hasAuthHeader: !!token,
        error: bearerErr,
        user: bearerUser ? { id: bearerUser.id, email: bearerUser.email } : null,
        profile: bearerProfile,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ _fatal: e?.message || "Server error" }, { status: 500 });
  }
}
