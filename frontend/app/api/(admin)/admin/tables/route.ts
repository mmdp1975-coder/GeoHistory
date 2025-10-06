import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServerClient";
import { requireAdmin } from "@/lib/api/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const { data, error } = await supabaseAdmin.rpc("list_public_tables");
    if (error) throw error;

    const tables = (data || []).map((row: any) => row.table_name as string);
    return NextResponse.json({ ok: true, tables });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
