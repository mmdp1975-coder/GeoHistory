/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { table: string; id: string } };

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const sr  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !sr) throw new Error("Missing envs");
  return createClient(url, sr, { auth: { persistSession: false } });
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const table = (params?.table || "").trim();
    const id = (params?.id || "").trim();
    if (!table || !id) return NextResponse.json({ error: "Missing table or id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const sb = admin();
    const { data, error } = await sb.from(table).update(body).eq("id", id).select("*");
    if (error) throw error;

    return NextResponse.json({ ok: true, table, id, updated: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const table = (params?.table || "").trim();
    const id = (params?.id || "").trim();
    if (!table || !id) return NextResponse.json({ error: "Missing table or id" }, { status: 400 });

    const sb = admin();
    const { data, error } = await sb.from(table).delete().eq("id", id).select("*");
    if (error) throw error;

    return NextResponse.json({ ok: true, table, id, deleted: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}

// Le altre HTTP methods non sono gestite qui (evitiamo conflitti)
export async function GET()  { return NextResponse.json({ error: "Not Found" }, { status: 404 }); }
export async function POST() { return NextResponse.json({ error: "Not Found" }, { status: 404 }); }
