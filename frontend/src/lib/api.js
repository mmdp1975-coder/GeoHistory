// src/lib/api.js

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function apiBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE || "/api";
  return base;
}

function toAbs(path) {
  const base = apiBase().replace(/\/$/, "");
  if (/^https?:\/\//i.test(base)) {
    return new URL(base + path).toString();
  }
  const origin = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin : "http://localhost:3000";
  return new URL(base + path, origin).toString();
}

function appendParams(url, params) {
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.append(k, String(v));
    }
  }
}

export async function getOptions(type, params = {}) {
  const url = new URL(toAbs("/options"));
  url.searchParams.set("type", String(type || ""));
  appendParams(url, params);
  if (url.searchParams.has("lang")) {
    url.searchParams.set("lang", url.searchParams.get("lang").toLowerCase());
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("getOptions failed " + res.status);
  return res.json();
}

/* =================== HELPERS =================== */
async function getEventsFromNext(params = {}) {
  const url = new URL(toAbs("/events"));
  appendParams(url, params);
  if (url.searchParams.has("lang")) {
    url.searchParams.set("lang", url.searchParams.get("lang").toLowerCase());
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("getEvents failed " + res.status);
  return res.json();
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`"“”„]/g, "'")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ").trim();
}

export function groupMatches(ev, selectedGroup) {
  if (!selectedGroup) return true;
  const g = norm(selectedGroup);
  const fields = [
    ev.group_event, ev.group_event_it, ev.group_event_en,
    ev.group, ev.group_it, ev.group_en
  ].map(norm);
  return fields.some(f => f === g || f.includes(g));
}

async function getEventsFromSupabaseBroad(limit = 10000) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const url = new URL(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/events");
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(limit));
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: "Bearer " + SUPABASE_ANON,
    "Cache-Control": "no-store"
  };
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;
  return res.json();
}

/* =================== UNIFIED ENTRY =================== */
export async function getEvents(params = {}) {
  const limit = params.limit ?? 10000;
  const group =
    params.group || params.group_event || params.group_event_it || params.group_event_en;

  // Se NON c'è un group selezionato → usa la route Next (manteniamo pipeline esistente).
  if (!group) {
    try {
      return await getEventsFromNext({ ...params, limit });
    } catch (e) {
      // fallback totale su Supabase broad (senza filtri) se Next fallisce
      const sb = await getEventsFromSupabaseBroad(limit);
      if (Array.isArray(sb)) return sb;
      throw e;
    }
  }

  // Se C'È un group selezionato → BYPASS backend:
  // prendi dataset ampio da Supabase REST (senza filtri server) e lascia al client il filtro.
  const sb = await getEventsFromSupabaseBroad(limit);
  if (Array.isArray(sb)) return sb;

  // Se Supabase non disponibile, ultima spiaggia: route Next (potrebbe restituire "3")
  return await getEventsFromNext({ ...params, limit });
}
