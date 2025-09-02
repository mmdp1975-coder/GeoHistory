// src/lib/api.js

// Per debug rigoroso: usa SEMPRE gli endpoint locali Next.js
const API_EVENTS = "/api/events";
const API_OPTIONS = "/api/options";

export async function getEvents(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const url = `${API_EVENTS}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`getEvents ${res.status} ${url}`);
  const data = await res.json();
  // L'endpoint locale ritorna già un ARRAY
  return Array.isArray(data) ? data : (Array.isArray(data?.events) ? data.events : []);
}

export async function getOptions(type, query = {}) {
  if (!type) return [];
  const qs = new URLSearchParams({ type });
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const url = `${API_OPTIONS}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`getOptions ${type} ${res.status} ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
