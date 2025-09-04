// src/app/api/options/route.js
import { NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = {
  groups: `
    SELECT DISTINCT group_event AS value
    FROM events
    WHERE ($1::text IS NULL OR lower(lang) = lower($1))
    ORDER BY 1;
  `,
  continents: `
    SELECT DISTINCT continent AS value
    FROM events
    WHERE ($1::text IS NULL OR lower(lang) = lower($1))
    ORDER BY 1;
  `,
  locations: `
    SELECT DISTINCT location AS value
    FROM events
    WHERE ($1::text IS NULL OR lower(lang) = lower($1))
    ORDER BY 1;
  `,
};

export async function GET(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const langRaw = url.searchParams.get("lang");
  const lang = langRaw ? langRaw.toLowerCase() : null;

  if (!type || !SQL[type]) {
    return NextResponse.json({ error: "Invalid 'type' parameter" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(SQL[type], [lang]);
    return NextResponse.json(rows.map(r => r.value));
  } catch (err) {
    console.error("[/api/options] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
