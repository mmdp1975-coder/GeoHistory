// app/api/admin-db/[...slug]/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

/* ---------- env helpers (fallback .env.local) ---------- */
function readEnvLocalVar(name: string): string | null {
  try {
    const p = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, "utf8");
    const re = new RegExp(`^${name}=(.*)$`, "m");
    const m = txt.match(re);
    if (!m) return null;
    let v = (m[1] || "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    return v || null;
  } catch {
    return null;
  }
}
function resolveServiceRoleKey(): string {
  let v = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const looksPlaceholder = /LA-TUA|SERVICE|PLACEHOLDER/i.test(v);
  if (!v || v.length < 60 || looksPlaceholder) {
    const fromFile = readEnvLocalVar("SUPABASE_SERVICE_ROLE_KEY");
    if (fromFile && fromFile.length >= 60) v = fromFile;
  }
  return v;
}
function assertTableName(name: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error("Invalid table name");
}

/* ---------- supabase client ---------- */
function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = resolveServiceRoleKey();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL mancante");
  if (!serviceKey || serviceKey.length < 60)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante o non valida");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* ---------- queries ---------- */
async function listTables(supabase: ReturnType<typeof createClient>) {
  const SQL = `
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name not like 'pg_%'
      and table_name not like 'supabase_%'
      and table_name not in ('migrations')
    order by table_name
  `; // ⛔ nessun ';' finale
  const { data, error } = await (supabase as any).rpc("exec_sql", { sql_text: SQL });
  if (error) throw error;
  return Array.isArray(data) ? data.map((r: any) => r.table_name) : [];
}

async function getMeta(supabase: ReturnType<typeof createClient>, table: string) {
  const columnsSQL = `
    select
      c.ordinal_position,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.udt_name,
      c.column_default
    from information_schema.columns c
    where c.table_schema='public' and c.table_name='${table}'
    order by c.ordinal_position
  `;
  const pkSQL = `
    select a.attname as pk
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'public."${table}"'::regclass and i.indisprimary
  `;
  const fkSQL = `
    select
      tc.constraint_name,
      kcu.column_name as fk_column,
      ccu.table_name as ref_table,
      ccu.column_name as ref_column
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
      and ccu.table_schema = tc.table_schema
    where tc.table_schema='public'
      and tc.table_name='${table}'
      and tc.constraint_type='FOREIGN KEY'
    order by kcu.ordinal_position
  `;
  const { data: columns, error: e1 } = await (supabase as any).rpc("exec_sql", { sql_text: columnsSQL });
  if (e1) throw e1;
  const { data: pkrows, error: e2 } = await (supabase as any).rpc("exec_sql", { sql_text: pkSQL });
  if (e2) throw e2;
  const { data: fks, error: e3 } = await (supabase as any).rpc("exec_sql", { sql_text: fkSQL });
  if (e3) throw e3;
  const pk = Array.isArray(pkrows) && pkrows.length ? pkrows[0].pk : null;
  return { primaryKey: pk, columns: columns ?? [], foreignKeys: fks ?? [] };
}

/* ---------- HANDLERS ---------- */
export async function GET(
  req: NextRequest,
  context: { params?: { slug?: string[] } } = {}
) {
  try {
    const supabase = makeClient();
    const slug = context?.params?.slug ?? []; // [], ['tables'] o ['<table>'] o ['<table>','meta']

    // /api/admin-db  oppure  /api/admin-db/tables
    if (slug.length === 0 || (slug[0] || "").toLowerCase() === "tables") {
      const tables = await listTables(supabase);
      return NextResponse.json({ tables });
    }

    const table = slug[0];
    assertTableName(table);

    // /api/admin-db/<table>/meta
    if (slug.length >= 2 && (slug[1] || "").toLowerCase() === "meta") {
      const meta = await getMeta(supabase, table);
      return NextResponse.json({ table, ...meta });
    }

    // /api/admin-db/<table>?page=1&pageSize=25  → rows
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 25)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const countSel = await supabase.from(table).select("*", { head: true, count: "exact" });
    if (countSel.error) throw countSel.error;

    const dataSel = await supabase.from(table).select("*").range(from, to);
    if (dataSel.error) throw dataSel.error;

    return NextResponse.json({
      table,
      page,
      pageSize,
      total: countSel.count ?? 0,
      rows: dataSel.data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "admin-db GET error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params?: { slug?: string[] } } = {}
) {
  try {
    const supabase = makeClient();
    const slug = context?.params?.slug ?? [];
    const table = slug[0];
    if (!table) return NextResponse.json({ error: "Table name required" }, { status: 400 });
    assertTableName(table);

    const body = await req.json();
    const payload = Array.isArray(body) ? body : [body];

    const ins = await supabase.from(table).insert(payload).select("*");
    if (ins.error) throw ins.error;

    return NextResponse.json({ inserted: ins.data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "admin-db POST error" }, { status: 400 });
  }
}
