// src/lib/api.js

/** Costruisce l’URL base delle API (Next.js App Route) */
function apiBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE || "/api";
  // Se è relativo ("/api"), useremo window.location.origin quando serve
  return base;
}

/** getOptions: ora accetta un oggetto params (es. { lang:"IT", continent:"Europe" }) */
export async function getOptions(type, params = {}) {
  const base = apiBase();

  // Costruzione URL robusta sia con base relativa che assoluta
  const url = new URL(
    `${base.replace(/\/$/, "")}/options`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );

  url.searchParams.set("type", String(type).toLowerCase());

  // Aggiunge tutti i params passati da FiltersBar
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") {
      if (k.toLowerCase() === "lang") {
        url.searchParams.set("lang", String(v).toLowerCase());
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`getOptions failed ${res.status}`);
  return res.json();
}

/** getEvents: lascia invariato ma accetta params oggetto */
export async function getEvents(params = {}) {
  const base = apiBase();
  const url = new URL(
    `${base.replace(/\/$/, "")}/events`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.append(k, String(v));
    }
  }
  if (url.searchParams.has("lang")) {
    url.searchParams.set("lang", url.searchParams.get("lang").toLowerCase());
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`getEvents failed ${res.status}`);
  return res.json();
}
