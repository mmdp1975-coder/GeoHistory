const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

const qs = (obj = {}) =>
  Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" )
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

export async function getOptions(type, { lang="IT", q="", continent="", country="", location="" } = {}) {
  const url = `${API_BASE}/api/options?${qs({ type, lang, q, continent, country, location })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.rows || [];
}

export async function getEvents({
  lang="IT", q="", continent="", country="", location="", group="",
  year_start=null, year_end=null, limit=1000, offset=0
} = {}) {
  const url = `${API_BASE}/api/events?${qs({ lang, q, continent, country, location, group, year_start, year_end, limit, offset })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.rows || [];
}
