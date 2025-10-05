/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { table: string } };

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const sr  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !sr) throw new Error("Missing envs");
  return createClient(url, sr, { auth: { persistSession: false } });
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const table = (params?.table || "").trim();
    if (!table) return NextResponse.json({ error: "Missing table" }, { status: 400 });

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.max(1, parseInt(url.searchParams.get("pageSize") || "25", 10));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const sb = admin();

    // Verifica se esiste una colonna "id" per l'ordinamento
    const meta = await sb
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", table);

    if (meta.error) throw meta.error;
    const hasId = (meta.data || []).some((c: any) => c.column_name === "id");

    const base = sb.from(table).select("*", { count: "exact" }).range(from, to);
    const { data, error, count } = hasId ? await base.order("id", { ascending: true }) : await base;
    if (error) throw error;

    return NextResponse.json({ ok: true, table, rows: data || [], total: count ?? 0, page, pageSize });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const table = (params?.table || "").trim();
    if (!table) return NextResponse.json({ error: "Missing table" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const sb = admin();
    const { data, error } = await sb.from(table).insert(body).select("*");
    if (error) throw error;

    return NextResponse.json({ ok: true, table, inserted: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
