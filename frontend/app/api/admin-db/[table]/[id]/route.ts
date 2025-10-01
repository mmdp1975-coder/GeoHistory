import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseBrowserClient";

// Helper per leggere i metadati di una tabella
async function getTableMeta(table: string) {
  try {
    // NB: Supabase non espone i metadati in automatico.
    // Qui puoi sostituire con una query verso una view custom se l’hai creata.
    return { name: table, columns: [] };
  } catch (err) {
    console.error("getTableMeta error:", err);
    return { name: table, columns: [] };
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: { table: string; id: string } }
) {
  const { table, id } = ctx.params;

  try {
    const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
    if (error) throw error;

    const meta = await getTableMeta(table);

    return NextResponse.json({ table, id, meta, row: data });
  } catch (e: any) {
    console.error("GET error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Error fetching row" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: { table: string; id: string } }
) {
  const { table, id } = ctx.params;

  try {
    const body = await req.json();
    const { data, error } = await supabase.from(table).update(body).eq("id", id).select();
    if (error) throw error;

    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    console.error("POST error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Error updating row" },
      { status: 500 }
    );
  }
}
