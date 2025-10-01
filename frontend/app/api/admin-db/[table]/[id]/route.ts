// app/api/admin-db/[table]/[id]/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

/* -------- helpers ENV (fallback a .env.local) -------- */
function readEnvLocalVar(name: string): string | null {
  try {
    const p = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, "utf8");
    const re = new RegExp(`^${name}=(.*)$`, "m");
    const m = txt.match(re);
    if (!m) return null;
    let v = (m[1] || "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v || null;
  } catch { return null; }
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
function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = resolveServiceRoleKey();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL mancante");
  if (!key || key.length < 60) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante o non valida");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* -------- utils DB -------- */
async function getPrimaryKey(supabase: ReturnType<typeof createClient>, table: string) {
  const SQL = `
    select a.attname as pk
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'public."${table}"'::regclass and i.indisprimary
  `;
  const { data, error } = await (supabase as any).rpc("exec_sql", { sql_text: SQL });
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0].pk : null;
}
async function getPKOrId(supabase: ReturnType<typeof createClient>, table: string) {
  const pk = await getPrimaryKey(supabase, table);
  if (pk) return pk;
  const checkIdSQL = `
    select column_name
    from information_schema.columns
    where table_schema='public' and table_name='${table}' and column_name='id'
  `;
  const { data, error } = await (supabase as any).rpc("exec_sql", { sql_text: checkIdSQL });
  if (error) throw error;
  if (Array.isArray(data) && data.length) return "id";
  throw new Error(`Primary key not found for table ${table} (and no 'id' column)`);
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

/* ----------------- GET (serve /meta) ----------------- */
export async function GET(
  _req: NextRequest,
  { params }: { params: { table: string; id: string } }
) {
  try {
    const table = params.table;
    const id = params.id;
    assertTableName(table);

    // Solo per /api/admin-db/<table>/meta
    if (id !== "meta") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = makeClient();
    const meta = await getMeta(supabase, table);
    return NextResponse.json({ table, ...meta });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Meta error" }, { status: 500 });
  }
}

/* ----------------- UPDATE ----------------- */
export async function PUT(
  req: NextRequest,
  { params }: { params: { table: string; id: string } }
) {
  try {
    const table = params.table; const id = params.id;
    assertTableName(table);

    const supabase = makeClient();
    const pk = await getPKOrId(supabase, table);

    const body = await req.json();
    const upd = await supabase.from(table).update(body).eq(pk, id).select("*");
    if (upd.error) throw upd.error;

    return NextResponse.json({ updated: upd.data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Update error" }, { status: 400 });
  }
}

/* ----------------- DELETE ----------------- */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { table: string; id: string } }
) {
  try {
    const table = params.table; const id = params.id;
    assertTableName(table);

    const supabase = makeClient();
    const pk = await getPKOrId(supabase, table);

    const del = await supabase.from(table).delete().eq(pk, id).select("*");
    if (del.error) throw del.error;

    return NextResponse.json({ deleted: del.data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Delete error" }, { status: 400 });
  }
}
