// src/app/api/options/route.js
export const runtime = 'nodejs'; // serve per usare 'pg' su Vercel

import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// cache: scopre se la colonna 'lang' esiste
let hasLangColumn = null;
async function ensureSchema() {
  if (hasLangColumn !== null) return;
  const q = `
    select 1
    from information_schema.columns
    where table_schema='public' 
      and table_name='events' 
      and column_name='lang'
    limit 1;
  `;
  const res = await pool.query(q);
  hasLangColumn = res.rowCount > 0;
}

// costruisce la query in base al type e alla presenza della colonna lang
function buildSQL(type, lang) {
  const cols = {
    groups: "group_event",
    continents: "continent",
    locations: "location",
  };
  const col = cols[type];
  if (!col) return null;

  if (hasLangColumn && lang) {
    return {
      text: `
        SELECT DISTINCT ${col} AS value
        FROM public.events
        WHERE lower(lang) = lower($1)
        ORDER BY 1;
      `,
      params: [lang],
    };
  } else {
    return {
      text: `
        SELECT DISTINCT ${col} AS value
        FROM public.events
        ORDER BY 1;
      `,
      params: [],
    };
  }
}

export async function GET(req) {
  try {
    await ensureSchema();

    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const langRaw = url.searchParams.get("lang");
    const lang = langRaw ? String(langRaw).toLowerCase() : null;

    const sql = buildSQL(type, lang);
    if (!sql) {
      return NextResponse.json({ error: "Invalid 'type' parameter" }, { status: 400 });
    }

    const { rows } = await pool.query(sql.text, sql.params);
    return NextResponse.json(rows.map(r => r.value));
  } catch (err) {
    console.error("[/api/options] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
