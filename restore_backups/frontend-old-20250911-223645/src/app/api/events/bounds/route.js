// src/app/api/events/bounds/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ...qui sotto lascia il contenuto esistente della tua route bounds...

import { NextResponse } from "next/server";

// Calcolo min/max anno sugli stessi filtri dell'elenco eventi
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
function rowBounds(r) {
  const ys = [r.year_from, r.event_year, toYear(r.exact_date)].filter(n => typeof n === "number");
  const ye = [r.year_to,   r.event_year, toYear(r.exact_date)].filter(n => typeof n === "number");
  const minY = ys.length ? Math.min(...ys) : null;
  const maxY = ye.length ? Math.max(...ye) : (minY ?? null);
  return { minY, maxY };
}

export async function GET(req) {
  try {
    if (!hasEnv()) {
      console.error("[/api/events/bounds] Missing Supabase env. Set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_*)");
      return NextResponse.json({ min_year: null, max_year: null }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const lang      = (searchParams.get("lang") || "IT").trim().toUpperCase(); // riservato per coerenza futura
    const q         = (searchParams.get("q") || "").trim();
    const continent = (searchParams.get("continent") || "").trim();
    const country   = (searchParams.get("country") || "").trim();
    const location  = (searchParams.get("location") || "").trim();
    const group     = (searchParams.get("group") || "").trim();

    const base = supaUrl();
    const url  = new URL(`${base}/rest/v1/events`);
    const qs   = url.searchParams;

    qs.set("select", [
      "year_from","year_to","event_year","exact_date",
      // per filtrare coerentemente con l'elenco:
      "event_en","event_it",
      "group_event_en","group_event_it",
      "continent","country","location"
    ].join(","));
    qs.set("order", "id.asc");

    if (continent) qs.set("continent", `eq.${continent}`);
    if (country)   qs.set("country",   `eq.${country}`);
    if (location)  qs.set("location",  `eq.${location}`);
    if (group)     qs.set("or", `(group_event_en.eq.${group},group_event_it.eq.${group})`);

    if (q) {
      const like = q.replace(/[%]/g, "").toLowerCase();
      const prev = qs.get("or");
      const textCond = (lang === "EN")
        ? `event_en.ilike.%25${like}%25`
        : `event_it.ilike.%25${like}%25`;
      qs.set("or", `(${[prev, textCond].filter(Boolean).join(",")})`);
    }

    const res = await fetch(url.toString(), { headers: supaHeaders(), cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Supabase REST error ${res.status}: ${txt}`);
    }
    const rows = await res.json();

    let min = null, max = null;
    for (const r of rows) {
      const { minY, maxY } = rowBounds(r);
      if (minY == null && maxY == null) continue;
      if (min === null || (minY != null && minY < min)) min = (minY ?? maxY);
      if (max === null || (maxY != null && maxY > max)) max = (maxY ?? minY);
    }

    return NextResponse.json({ min_year: min, max_year: max }, { status: 200 });
  } catch (err) {
    console.error("[/api/events/bounds] error:", err);
    return NextResponse.json({ min_year: null, max_year: null }, { status: 200 });
  }
}
