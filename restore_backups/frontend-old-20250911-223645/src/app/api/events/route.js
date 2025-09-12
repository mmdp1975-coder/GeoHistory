// src/app/api/events/route.js

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ...qui sotto lascia il contenuto esistente della tua route (fetch da Supabase)...

import { NextResponse } from "next/server";

/**
 * Ritorna la lista di eventi filtrati (ARRAY).
 * Query:
 *  - lang: IT|EN (default IT)
 *  - q: testo libero (ilike su campi localizzati)
 *  - continent, country, location, group
 *  - year_start, year_end
 *  - limit (default 2000)
 */

// --- Util ---
function envTrim(n) { const v = process.env[n]; return typeof v === "string" ? v.trim() : ""; }
function supaUrl() { return envTrim("SUPABASE_URL") || envTrim("NEXT_PUBLIC_SUPABASE_URL"); }
function supaKey() { return envTrim("SUPABASE_ANON_KEY") || envTrim("NEXT_PUBLIC_SUPABASE_ANON_KEY"); }
function hasEnv()  { return !!(supaUrl() && supaKey()); }

function supaHeaders() {
  const key = supaKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    Prefer: "count=exact",
    Range: "0-999999",
  };
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
function normalizeI18n(row, lang) {
  const isIt = (lang || "IT").toUpperCase() !== "EN";
  const ev = {
    ...row,
    event:        isIt ? (row.event_it       ?? row.event_en       ?? row.event)       : (row.event_en       ?? row.event_it       ?? row.event),
    group_event:  isIt ? (row.group_event_it ?? row.group_event_en ?? row.group_event) : (row.group_event_en ?? row.group_event_it ?? row.group_event),
    description:  isIt ? (row.description_it ?? row.description_en ?? row.description) : (row.description_en ?? row.description_it ?? row.description),
    wikipedia:    isIt ? (row.wikipedia_it   ?? row.wikipedia_en   ?? row.wikipedia)   : (row.wikipedia_en   ?? row.wikipedia_it   ?? row.wikipedia),
  };
  const lat = ev.latitude  ?? ev.lat ?? ev.Latitude  ?? ev.y ?? null;
  const lon = ev.longitude ?? ev.lng ?? ev.lon       ?? ev.Longitude ?? ev.x ?? null;
  ev.latitude  = Number.isFinite(lat) ? lat : (lat != null ? Number(lat) : null);
  ev.longitude = Number.isFinite(lon) ? lon : (lon != null ? Number(lon) : null);
  return ev;
}

export async function GET(req) {
  try {
    if (!hasEnv()) {
      console.error("[/api/events] Missing Supabase env. Set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_*)");
      return NextResponse.json([], { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const lang      = (searchParams.get("lang") || "IT").trim().toUpperCase();
    const q         = (searchParams.get("q") || "").trim();
    const continent = (searchParams.get("continent") || "").trim();
    const country   = (searchParams.get("country") || "").trim();
    const location  = (searchParams.get("location") || "").trim();
    const group     = (searchParams.get("group") || "").trim();
    const ys        = searchParams.get("year_start") !== null ? Number(searchParams.get("year_start")) : null;
    const ye        = searchParams.get("year_end")   !== null ? Number(searchParams.get("year_end"))   : null;
    const limit     = searchParams.get("limit") !== null ? Math.max(1, Math.min(10000, Number(searchParams.get("limit")))) : 2000;

    const base = supaUrl();
    const url  = new URL(`${base}/rest/v1/events`);
    const qs   = url.searchParams;

    // Colonne necessarie
    qs.set("select", [
      "id",
      "title",
      "event_en","event_it",
      "group_event_en","group_event_it",
      "description_en","description_it",
      "wikipedia_en","wikipedia_it",
      "year_from","year_to","event_year","exact_date",
      "continent","country","location",
      "latitude","longitude",
      "type_event"
    ].join(","));
    qs.set("order", "id.asc");

    // Filtri base
    if (continent) qs.set("continent", `eq.${continent}`);
    if (country)   qs.set("country",   `eq.${country}`);
    if (location)  qs.set("location",  `eq.${location}`);
    if (group)     qs.set("or", `(group_event_en.eq.${group},group_event_it.eq.${group})`);

    // Ricerca testuale lingua-specifica
    if (q) {
      const like = q.replace(/[%]/g, "").toLowerCase();
      const prev = qs.get("or");
      const textCond = (lang === "EN")
        ? `event_en.ilike.%25${like}%25,description_en.ilike.%25${like}%25`
        : `event_it.ilike.%25${like}%25,description_it.ilike.%25${like}%25`;
      qs.set("or", `(${[prev, textCond].filter(Boolean).join(",")})`);
    }

    const res = await fetch(url.toString(), { headers: supaHeaders(), cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Supabase REST error ${res.status}: ${txt}`);
    }
    let rows = await res.json();

    if (ys != null || ye != null) rows = rows.filter(r => eventInRange(r, ys, ye));
    const out = rows.slice(0, limit).map(r => normalizeI18n(r, lang));

    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    console.error("[/api/events] error:", err);
    return NextResponse.json([], { status: 200 });
  }
}


