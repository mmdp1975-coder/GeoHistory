import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// -- Configurazione client Supabase lato server -------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string; // consigliato lato server
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Usa service-role se disponibile, altrimenti anon (fallback)
const supabase: SupabaseClient<any, any, any, any, any> = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
);

// -- Helpers tipizzati in modo compatibile (evitiamo il conflitto "never") ---
async function listTables(client: SupabaseClient<any, any, any, any, any>) {
  // Nota: PostgREST espone solo gli oggetti nello schema esposto (di solito "public").
  // Se hai una view che elenca le tabelle (es. v_tables) usa quella. In alternativa prova
  // a leggere la lista dalle viste di sistema esposte (in Supabase di default non sono esposte).
  //
  // Qui implemento una lettura "safe": se hai una tabella di controllo (es. _schema_tables) usala.
  // In mancanza, ritorno un array vuoto per non bloccare la build (potrai sostituire con la tua query).
  try {
    // ESEMPIO (se esiste una view pubblica "v_tables" con {table_schema, table_name}):
    // const { data, error } = await client.from("v_tables").select("table_schema, table_name");
    // if (error) throw error;
    // return data?.map(r => `${r.table_schema}.${r.table_name}`) ?? [];

    return []; // fallback: nessuna tabella (non rompe la build)
  } catch (err) {
    console.error("listTables error:", err);
    return [];
  }
}

async function getTableRows(
  client: SupabaseClient<any, any, any, any, any>,
  table: string,
  limit = 100
) {
  // Legge righe da una tabella dello schema "public"
  const { data, error } = await client.from(table).select("*").limit(limit);
  if (error) throw error;
  return data ?? [];
}

// -----------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  ctx: { params: { slug?: string[] } }
) {
  try {
    const slug = ctx.params?.slug ?? [];

    // /api/admin-db  oppure  /api/admin-db/tables
    if (slug.length === 0 || (slug[0] || "").toLowerCase() === "tables") {
      const tables = await listTables(supabase);
      return NextResponse.json({ tables });
    }

    // /api/admin-db/rows/<tableName>
    if (slug.length >= 2 && (slug[0] || "").toLowerCase() === "rows") {
      const tableName = slug[1];
      const rows = await getTableRows(supabase, tableName);
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
