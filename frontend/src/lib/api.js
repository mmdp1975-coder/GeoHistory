// src/lib/api.js
export async function getOptions(type, lang) {
  const base = process.env.NEXT_PUBLIC_API_BASE || "/api";
  // il backend ora gestisce automaticamente la presenza/assenza di 'lang'
  const url = new URL(`${base}/options`, window.location.origin);
  url.searchParams.set("type", type);
  if (lang) url.searchParams.set("lang", String(lang).toLowerCase());

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`getOptions failed ${res.status}`);
  return res.json();
}

export async function getEvents(params = {}) {
  const base = process.env.NEXT_PUBLIC_API_BASE || "/api";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      sp.append(k, String(v));
    }
  }
  if (sp.has("lang")) sp.set("lang", sp.get("lang").toLowerCase());

  const url = `${base}/events?${sp.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`getEvents failed ${res.status}`);
  return res.json();
}
