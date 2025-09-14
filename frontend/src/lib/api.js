// src/lib/api.js

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* === DEBUG: puoi metterlo a false quando hai finito === */
const SEARCH_DEBUG = false;

/* ---------- URL helpers ---------- */
function apiBase() { return process.env.NEXT_PUBLIC_API_BASE || "/api"; }
function toAbs(path) {
  const base = apiBase().replace(/\/$/, "");
  if (/^https?:\/\//i.test(base)) return new URL(base + path).toString();
  const origin = (typeof window !== "undefined" && window.location?.origin)
    ? window.location.origin : "http://localhost:3000";
  return new URL(base + path, origin).toString();
}
function appendParams(url, params) {
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.append(k, String(v));
  }
}

/* ---------- normalizzazione ---------- */
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`"“”„]/g, "'")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}
const has  = (v) => v !== undefined && v !== null && v !== "";
const same = (a, b) => norm(a) === norm(b);

/* ---------- search parola intera + alias ---------- */
const ALIASES = {
  rome: ["rome", "roma"],
  florence: ["florence", "firenze"],
  milan: ["milan", "milano"],
  turin: ["turin", "torino"],
  venice: ["venice", "venezia"],
  naples: ["naples", "napoli"],
  genoa: ["genoa", "genova"],
  padua: ["padua", "padova"],
  verona: ["verona"],
  bologna: ["bologna"],
  pisa: ["pisa"],
};
function tokenize(text) { return norm(text).split(/[^a-z0-9]+/).filter(Boolean); }
function expandAliases(t) {
  const key = norm(t);
  const set = new Set([key]);
  const ali = ALIASES[key];
  if (ali) ali.forEach(a => set.add(norm(a)));
  return set;
}

const SEARCH_FIELDS = [
  "event","event_it","event_en",
  "title","title_it","title_en",
  "description","description_it","description_en","desc","desc_it","desc_en",
  "group_event","group_event_it","group_event_en",
  "tags","figures",
  "continent","country","location",
];

function buildHay(ev) {
  return SEARCH_FIELDS.map(k => ev?.[k]).filter(Boolean).join(" | ");
}

function textMatches(ev, q, dbg = null) {
  if (!q) return true;
  const hay = buildHay(ev);
  const hayTokens = new Set(tokenize(hay));
  const queryTokens = tokenize(q);
  const ok = queryTokens.every(t => {
    const aliases = expandAliases(t);
    for (const a of aliases) if (hayTokens.has(a)) return true;
    return false;
  });
  if (dbg) {
    dbg.hayTokens = Array.from(hayTokens).slice(0, 80);
    dbg.queryTokens = queryTokens;
    dbg.aliasesPerToken = queryTokens.map(t => Array.from(expandAliases(t)));
    dbg.matched = ok;
  }
  return ok;
}

/* ---------- backend routes ---------- */
async function fetchFromNext(path, params = {}) {
  const url = new URL(toAbs(path));
  appendParams(url, params);
  if (url.searchParams.has("lang")) {
    url.searchParams.set("lang", url.searchParams.get("lang").toLowerCase());
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch ${path} failed: ${res.status}`);
  return res.json();
}

async function getEventsFromSupabaseBroad(limit = 20000) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const url = new URL(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/events");
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(limit));
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: "Bearer " + SUPABASE_ANON,
    "Cache-Control": "no-store",
  };
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;
  return res.json();
}

/* ---------- filtri client-side ---------- */
export function groupMatches(ev, selectedGroup) {
  if (!selectedGroup) return true;
  const g = norm(selectedGroup);
  const fields = [
    ev.group_event, ev.group_event_it, ev.group_event_en,
    ev.group, ev.group_it, ev.group_en
  ].map(norm);
  return fields.some(f => f === g || f.includes(g));
}
function matchesGeo(ev, { continent, country, location }) {
  if (has(continent) && !same(ev.continent, continent)) return false;
  if (has(country)   && !same(ev.country,   country))   return false;
  if (has(location)  && !same(ev.location,  location))  return false;
  return true;
}
function matchesYears(ev, { year_start, year_end }) {
  if (year_start == null && year_end == null) return true;
  const yf = Number(ev.year_from), yt = Number(ev.year_to);
  const s = Number(year_start ?? -Infinity), e = Number(year_end ?? +Infinity);
  const left  = Number.isFinite(yf) ? yf : yt;
  const right = Number.isFinite(yt) ? yt : yf;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
  return right >= s && left <= e;
}
function applyClientFilters(items, params) {
  if (!Array.isArray(items)) return [];
  const g = params.group || params.group_event || params.group_event_it || params.group_event_en;

  if (SEARCH_DEBUG) {
    const sample = (items || []).slice(0, 3).map((ev, i) => {
      const out = { _index: i };
      for (const k of SEARCH_FIELDS) if (ev?.[k]) out[k] = ev[k];
      const dbg = {};
      textMatches(ev, params.q, dbg);
      out.__search_debug = dbg;
      return out;
    });
    // eslint-disable-next-line no-console
    console.log("%cSEARCH DEBUG — first events + tokens","background:#1f2937;color:#fff;padding:3px 6px;border-radius:4px",
      { query: params.q, tokens: tokenize(params.q || ""), aliases: (params.q ? Array.from(expandAliases(params.q)) : []), usingFields: SEARCH_FIELDS, sample }
    );
  }

  return items.filter(ev =>
    groupMatches(ev, g) &&
    matchesGeo(ev, params) &&
    matchesYears(ev, params) &&
    textMatches(ev, params.q)
  );
}

/* ---------- GET EVENTS ---------- */
export async function getEvents(params = {}) {
  const limit = params.limit ?? 20000;

  // NON mandiamo `q` al backend: facciamo la ricerca testo solo client-side
  const serverParams = { ...params, limit };
  if ("q" in serverParams) { serverParams.q = undefined; delete serverParams.q; }

  try {
    const server = await fetchFromNext("/events", serverParams);
    return applyClientFilters(server, params);
  } catch (_) {}

  const sb = await getEventsFromSupabaseBroad(limit);
  if (Array.isArray(sb)) return applyClientFilters(sb, params);

  try {
    const server = await fetchFromNext("/events", serverParams);
    return applyClientFilters(server, params);
  } catch (_) {
    return [];
  }
}

/* ---------- GET OPTIONS (derivate dai risultati filtrati) ---------- */
function uniqCount(arr) {
  const map = new Map();
  for (const k of arr) map.set(k, (map.get(k) || 0) + 1);
  return Array.from(map.entries()).map(([value, count]) => ({ value, label: value, count }));
}
function deriveOptionsFromEvents(type, params, events) {
  const filtered = applyClientFilters(events, params);

  if (type === "continents") {
    const vals = (filtered.length ? filtered : events).map(e => e.continent).filter(Boolean);
    return uniqCount(vals).sort((a, b) => a.value.localeCompare(b.value));
  }
  if (type === "countries") {
    const base = filtered.filter(e => !has(params.continent) || same(e.continent, params.continent));
    const vals = base.map(e => e.country).filter(Boolean);
    return uniqCount(vals).sort((a, b) => a.value.localeCompare(b.value));
  }
  if (type === "locations") {
    const base = filtered
      .filter(e => !has(params.continent) || same(e.continent, params.continent))
      .filter(e => !has(params.country)   || same(e.country,   params.country));
    const vals = base.map(e => e.location).filter(Boolean);
    return uniqCount(vals).sort((a, b) => a.value.localeCompare(b.value));
  }
  if (type === "groups") {
    const lang = String(params.lang || "it").toLowerCase();
    const vals = filtered.map(e => {
      const raw = e.group_event || e.group || "";
      const it  = e.group_event_it || e.group_it || raw;
      const en  = e.group_event_en || e.group_en || raw;
      const label = (lang === "en") ? en : it;
      return { value: raw, label: label || raw };
    }).filter(g => g.value);
    const map = new Map();
    for (const g of vals) {
      const k = g.value;
      const prev = map.get(k);
      map.set(k, { value: k, label: g.label, count: (prev?.count || 0) + 1 });
    }
    return Array.from(map.values()).sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value));
  }
  return [];
}

export async function getOptions(type, params = {}) {
  const events = await getEvents({
    group: params.group,
    continent: params.continent,
    country: params.country,
    location: params.location,
    year_start: params.year_start,
    year_end: params.year_end,
    lang: params.lang,
    q: params.q,
    limit: 20000,
  });
  return deriveOptionsFromEvents(type, params, events);
}
