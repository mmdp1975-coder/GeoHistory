/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { ensureDebugAccess } from "@/lib/debug/access";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabaseServerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    return { _error: error.message };
  }

  return data ?? null;
}

export async function GET(req: Request) {
  const guard = await ensureDebugAccess(req);
  if (!guard.ok) return guard.response;

  try {
    const supabase = getServerSupabase();
    const {
      data: { user: cookieUser },
      error: cookieErr,
    } = await supabase.auth.getUser();

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let bearerUser: any = null;
    let bearerErr: string | null = null;

    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error) {
        bearerErr = error.message;
      } else {
        bearerUser = data?.user ?? null;
      }
    }

    const cookieProfile = cookieUser?.id ? await fetchProfile(cookieUser.id) : null;
    const bearerProfile = bearerUser?.id ? await fetchProfile(bearerUser.id) : null;

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
      meta: {
        userId: guard.userId ?? null,
        nodeEnv: process.env.NODE_ENV || null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ _fatal: e?.message || "Server error" }, { status: 500 });
  }
}
