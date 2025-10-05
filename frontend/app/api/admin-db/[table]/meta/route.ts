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

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const table = (params?.table || "").trim();
    if (!table) return NextResponse.json({ error: "Missing table" }, { status: 400 });

    const sb = admin();
    const { data, error } = await sb
      .from("information_schema.columns")
      .select("column_name,data_type,ordinal_position")
      .eq("table_schema", "public")
      .eq("table_name", table)
      .order("ordinal_position", { ascending: true });

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
