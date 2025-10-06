/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";
import { requireAdmin } from "@/lib/api/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListQuery = {
  page: number;
  perPage: number;
  query: string | null;
};

function parseListQuery(url: URL): ListQuery {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("perPage") || "20", 10)));
  const query = (url.searchParams.get("query") || "").trim() || null;
  return { page, perPage, query };
}

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const { page, perPage, query } = parseListQuery(new URL(req.url));

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    let users = data?.users || [];
    if (query) {
      const q = query.toLowerCase();
      users = users.filter((u) =>
        u.email?.toLowerCase?.().includes(q) ||
        u.id.includes(q) ||
        u.user_metadata?.first_name?.toLowerCase?.().includes(q) ||
        u.user_metadata?.last_name?.toLowerCase?.().includes(q)
      );
    }

    const ids = users.map((u) => u.id);
    const { data: profRows } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .in("id", ids);
    const profiles: Record<string, any> = {};
    for (const row of profRows || []) {
      profiles[row.id] = row;
    }

    return NextResponse.json({
      ok: true,
      users,
      profiles,
      page,
      perPage,
      total: data?.total ?? users.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const payload = await req.json().catch(() => ({}));
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { email, password, phone, email_confirm, phone_confirm, user_metadata, app_metadata } = payload as any;
    if (!email && !phone) {
      return NextResponse.json({ error: "Email or phone is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      phone,
      email_confirm: email_confirm ?? true,
      phone_confirm: phone_confirm ?? false,
      user_metadata: user_metadata ?? null,
      app_metadata: app_metadata ?? undefined,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, user: data?.user ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
