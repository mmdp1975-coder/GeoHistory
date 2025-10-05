// app/api/admin-db/_debug_me/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabaseServerClient";

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
      if (error) bearerErr = error.message;
      bearerUser = data?.user ?? null;
    }

    // 3) PROFILE letti SEMPRE con service-role (niente RLS)
    let cookieProfile: any = null;
    let bearerProfile: any = null;

    if (cookieUser?.id) {
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", cookieUser.id).single();
      cookieProfile = data ?? null;
      if (error && error.code !== "PGRST116") cookieProfile = { _error: error.message };
    }
    if (bearerUser?.id) {
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", bearerUser.id).single();
      bearerProfile = data ?? null;
      if (error && error.code !== "PGRST116") bearerProfile = { _error: error.message };
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
