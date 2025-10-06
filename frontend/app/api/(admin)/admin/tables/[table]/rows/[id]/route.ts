/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";
import { requireAdmin } from "@/lib/api/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { table: string; id: string } };

function normalize(value: string | null | undefined) {
  return (value || "").trim();
}

export async function PUT(req: Request, { params }: Context) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const table = normalize(params?.table);
    const id = normalize(params?.id);
    if (!table || !id) {
      return NextResponse.json({ error: "Missing table or id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from(table).update(body).eq("id", id).select("*");
    if (error) throw error;

    return NextResponse.json({ ok: true, table, id, updated: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Context) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const table = normalize(params?.table);
    const id = normalize(params?.id);
    if (!table || !id) {
      return NextResponse.json({ error: "Missing table or id" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from(table).delete().eq("id", id).select("*");
    if (error) throw error;

    return NextResponse.json({ ok: true, table, id, deleted: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
