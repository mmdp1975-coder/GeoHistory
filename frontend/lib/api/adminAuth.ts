import { NextResponse } from "next/server";
import { getServerSupabase, supabaseAdmin } from "@/lib/supabaseServerClient";

const DEV_BYPASS_HEADER = "x-dev-bypass";
const DEV_BYPASS_TOKEN = process.env.API_DEV_BYPASS_TOKEN || "";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

async function ensureProfileAdmin(userId: string) {
  let data: { is_admin?: boolean | null } | null = null;
  let error: { code?: string; message: string } | null = null;
  try {
    const response = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    data = response.data;
    error = response.error;
  } catch (err: any) {
    return { ok: false as const, response: errorResponse(503, err?.message || "Admin check failed") };
  }

  if (error && error.code !== "PGRST116") {
    return { ok: false as const, response: errorResponse(500, error.message) };
  }

  if (!data?.is_admin) {
    return { ok: false as const, response: errorResponse(403, "Forbidden") };
  }

  return { ok: true as const };
}

export type AdminGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireAdmin(req: Request): Promise<AdminGuardResult> {
  const bypassHeader = req.headers.get(DEV_BYPASS_HEADER) || "";
  if (bypassHeader && DEV_BYPASS_TOKEN && bypassHeader === DEV_BYPASS_TOKEN) {
    return { ok: true, userId: "dev-bypass" };
  }

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (data?.user && !error) {
        const adminCheck = await ensureProfileAdmin(data.user.id);
        if (adminCheck.ok) {
          return { ok: true, userId: data.user.id };
        }
        return adminCheck;
      }
    } catch (err: any) {
      return { ok: false, response: errorResponse(503, err?.message || "Auth verification failed") };
    }
  }

  const supabase = getServerSupabase();
  let data;
  let error;
  try {
    const response = await supabase.auth.getUser();
    data = response.data;
    error = response.error;
  } catch (err: any) {
    return { ok: false, response: errorResponse(503, err?.message || "Auth verification failed") };
  }
  if (error) {
    return { ok: false, response: errorResponse(401, error.message) };
  }

  const user = data?.user;
  if (!user?.id) {
    return { ok: false, response: errorResponse(401, "Unauthorized") };
  }

  const adminCheck = await ensureProfileAdmin(user.id);
  if (adminCheck.ok) {
    return { ok: true, userId: user.id };
  }
  return adminCheck;
}
