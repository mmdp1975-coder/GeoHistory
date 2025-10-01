// src/app/api/dbcheck/route.js
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import pg from "pg";
const { Pool } = pg;

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function GET() {
  const hasEnv = !!process.env.DATABASE_URL;
  if (!hasEnv) {
    return json({ ok: false, step: "env", error: "Missing DATABASE_URL in Vercel env" }, 500);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 1) ping
    const ping = await pool.query("select 1 as ok");
    // 2) schema check
    const langCol = await pool.query(`
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='events' and column_name='lang'
      limit 1;
    `);
    // 3) count events
    const cnt = await pool.query("select count(*)::int as n from public.events");

    return json({
      ok: true,
      db: "connected",
      ping: ping.rows[0],
      hasLangColumn: langCol.rowCount > 0,
      eventsCount: cnt.rows[0]?.n ?? null,
    });
  } catch (err) {
    return json({ ok: false, step: "query", error: String(err?.message || err) }, 500);
  } finally {
    // chiude pool quando la lambda termina
  }
}
