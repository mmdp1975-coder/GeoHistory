/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";
import { requireAdmin } from "@/lib/api/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { table: string } };

export async function GET(req: Request, { params }: Context) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const table = (params?.table || "").trim();
    if (!table) {
      return NextResponse.json({ error: "Missing table" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("list_table_columns", { p_table: table });
    if (error) throw error;

    const columns = (data || []).map((c: any) => ({
      column_name: c.column_name,
      data_type: c.data_type,
    }));

    return NextResponse.json({ ok: true, table, columns });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
