/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";
import { requireAdmin } from "@/lib/api/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { table: string } };

function parsePagination(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("pageSize") || "25", 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

export async function GET(req: Request, { params }: Context) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const table = (params?.table || "").trim();
    if (!table) {
      return NextResponse.json({ error: "Missing table" }, { status: 400 });
    }

    const url = new URL(req.url);
    const { page, pageSize, from, to } = parsePagination(url);

    const { data: columnMeta, error: columnsError } = await supabaseAdmin.rpc("list_table_columns", {
      p_table: table,
    });
    if (columnsError) throw columnsError;

    const hasId = (columnMeta || []).some((c: any) => c.column_name === "id");

    const baseQuery = supabaseAdmin
      .from(table)
      .select("*", { count: "exact" })
      .range(from, to);

    const { data, error, count } = hasId
      ? await baseQuery.order("id", { ascending: true })
      : await baseQuery;

    if (error) throw error;

    return NextResponse.json({ ok: true, table, rows: data || [], total: count ?? 0, page, pageSize });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Context) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const table = (params?.table || "").trim();
    if (!table) {
      return NextResponse.json({ error: "Missing table" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from(table).insert(body).select("*");
    if (error) throw error;

    return NextResponse.json({ ok: true, table, inserted: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
