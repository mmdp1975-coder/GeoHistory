import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseBrowserClient";

// Helper per elencare le tabelle
async function listTables() {
  try {
    // NB: Supabase non espone information_schema di default.
    // Qui puoi collegarti a una view custom se ce l’hai.
    // Per ora ritorniamo un array vuoto come placeholder.
    return [];
  } catch (err) {
    console.error("listTables error:", err);
    return [];
  }
}

// Helper per leggere righe da una tabella
async function getTableRows(table: string, limit = 100) {
  try {
    const { data, error } = await supabase.from(table).select("*").limit(limit);
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error("getTableRows error:", err);
    return [];
  }
}

// ============================================================================

export async function GET(
  req: NextRequest,
  ctx: { params: { slug?: string[] } }
) {
  try {
    const slug = ctx.params?.slug ?? [];

    // /api/admin-db  oppure  /api/admin-db/tables
    if (slug.length === 0 || (slug[0] || "").toLowerCase() === "tables") {
      const tables = await listTables();
      return NextResponse.json({ tables });
    }

    // /api/admin-db/rows/<tableName>
    if (slug.length >= 2 && (slug[0] || "").toLowerCase() === "rows") {
      const tableName = slug[1];
      const rows = await getTableRows(tableName);
      return NextResponse.json({ table: tableName, rows });
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          "Use /api/admin-db, /api/admin-db/tables, or /api/admin-db/rows/{table}"
      },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("admin-db route error:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: { slug?: string[] } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ ok: true, received: body });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
