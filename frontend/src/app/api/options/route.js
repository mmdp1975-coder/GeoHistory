// src/app/api/options/route.js
import { NextResponse } from "next/server";

/**
 * Options endpoint via Supabase REST (no external libs).
 * type = "continents" | "countries" | "locations" | "groups" | "types"
 * Filtri opzionali: group, continent, country, location, lang, year_start, year_end
 * Output: [{ value: string, count: number }]
 *
 * Logica:
 * - scarico SOLO le colonne necessarie via REST
 * - applico filtri semplici (group/continent/country/location) lato REST
 * - filtro periodo lato server (year_from/year_to/event_year/exact_date)
 * - faccio distinct + count lato server
 */

function envTrim(name) { const v = process.env[name]; return typeof v === "string" ? v.trim() : ""; }
function hasEnv() { return !!(envTrim("NEXT_PUBLIC_SUPABASE_URL") && envTrim("NEXT_PUBLIC_SUPABASE_ANON_KEY")); }
function supaHeaders() {
  const key = envTrim("NEXT_PUBLIC_SUPABASE_ANON_KEY") || envTrim("SUPABASE_ANON_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", Prefer: "count=exact", Range: "0-999999" };
}
function fieldFor(type, lang) {
  const t = (type || "").toLowerCase();
  if (t === "continents") return "continent";
  if (t === "countries")  return "country";
  if (t === "locations")  return "location";
  if (t === "types")      return "type_event";
  if (t === "groups")     return (lang || "IT").toUpperCase() === "EN" ? "group_event_en" : "group_event_it";
  return null;
}
function toYear(d) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.getUTCFullYear();
}
function eventInRange(row, ys, ye) {
  const yf  = Number.isFinite(row.year_from)  ? row.year_from  : null;
  const yt  = Number.isFinite(row.year_to)    ? row.year_to    : null;
  const yev = Number.isFinite(row.event_year) ? row.event_year : null;
  const yd  = toYear(row.exact_date);
  const mins = [yf, yev, yd].filter(n => typeof n === "number");
  const maxs = [yt, yev, yd].filter(n => typeof n === "number");
  const minY = mins.length ? Math.min(...mins) : null;
  const maxY = maxs.length ? Math.max(...maxs) : minY;
  if (minY == null && maxY == null) return false;
  const a = (minY ?? maxY), b = (maxY ?? minY);
  if (ys != null && b < ys) return false;
  if (ye != null && a > ye) return false;
  return true;
}

export async function GET(req) {
  try {
    if (!hasEnv()) return NextResponse.json([], { status: 200 });

    const { searchParams } = new URL(req.url);
    const type      = (searchParams.get("type") || "").trim();
    const lang      = (searchParams.get("lang") || "").trim();
    const group     = (searchParams.get("group") || "").trim();
    const continent = (searchParams.get("continent") || "").trim();
    const country   = (searchParams.get("country") || "").trim();
    const location  = (searchParams.get("location") || "").trim();
    const ys        = searchParams.get("year_start") !== null ? Number(searchParams.get("year_start")) : null;
    const ye        = searchParams.get("year_end")   !== null ? Number(searchParams.get("year_end"))   : null;

    const col = fieldFor(type, lang);
    if (!col) return NextResponse.json([], { status: 200 });

    const base = envTrim("NEXT_PUBLIC_SUPABASE_URL") || envTrim("SUPABASE_URL");
    const url  = new URL(`${base}/rest/v1/events`);
    const qs   = url.searchParams;

    // colonne minime (target + campi tempo per filtro periodo)
    qs.set("select", `${col},year_from,year_to,event_year,exact_date`);
    qs.set("order", `${col}.asc`);

    // filtri semplici via REST
    if (continent) qs.set("continent", `eq.${continent}`);
    if (country)   qs.set("country",   `eq.${country}`);
    if (location)  qs.set("location",  `eq.${location}`);
    if (group)     qs.set("or", `(group_event_en.eq.${group},group_event_it.eq.${group})`);

    const res = await fetch(url.toString(), { headers: supaHeaders(), cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Supabase REST error ${res.status}: ${txt}`);
    }

    /** @type {Array<Record<string, any>>} */
    let rows = await res.json();

    // filtro periodo lato server (se impostato almeno un estremo)
    if (ys != null || ye != null) {
      rows = rows.filter(r => eventInRange(r, ys, ye));
    }

    // distinct + count lato server
    const counts = new Map();
    for (const r of rows) {
      const raw = r[col];
      if (raw == null) continue;
      const value = String(raw).trim();
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }

    const data = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: "base" }));

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[/api/options] error:", err);
    return NextResponse.json([], { status: 200 });
  }
}
