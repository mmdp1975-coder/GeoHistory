export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const env = (k) => (process?.env?.[k] ? String(process.env[k]) : "");
const SUPABASE_URL      = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY") || env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const supaHeaders = SUPABASE_ANON_KEY ? {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: "application/json",
  Prefer: "count=exact",
  Range: "0-0",
} : undefined;

export async function GET() {
  const info = {
    env: { has_SUPABASE_URL: !!SUPABASE_URL, has_SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY },
    rest: {
      endpoint_checked: SUPABASE_URL ? `${SUPABASE_URL}/rest/v1/events?select=id,title&order=id.asc` : null,
      ok: false, status: null, count: null, sample: null, error: null, response_headers: null,
    },
    hint: null,
  };

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      info.hint = "Manca SUPABASE_URL o SUPABASE_ANON_KEY (ENV su Vercel).";
      return NextResponse.json(info);
    }

    const res = await fetch(info.rest.endpoint_checked, { headers: supaHeaders, cache: "no-store" });
    info.rest.status = res.status;

    const hdrs = {}; res.headers.forEach((v, k) => hdrs[k] = v); info.rest.response_headers = hdrs;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      info.rest.error = `REST ${res.status}: ${text.slice(0, 400)}`;
      info.hint = "Se 404: view/tabella inesistente. Se 401/403: key/policy. Se 500: schema/RLS.";
      return NextResponse.json(info);
    }

    const rows = await res.json();
    info.rest.ok = true;
    const cr = res.headers.get("content-range");
    if (cr && cr.includes("/")) {
      const total = parseInt(cr.split("/")[1], 10);
      info.rest.count = Number.isFinite(total) ? total : (Array.isArray(rows) ? rows.length : 0);
    } else {
      info.rest.count = Array.isArray(rows) ? rows.length : 0;
    }
    info.rest.sample = Array.isArray(rows) && rows.length ? rows[0] : null;

    if (info.rest.count === 0) info.hint = "Count=0: probabile RLS/policy mancante o vista non esposta in public.";
    return NextResponse.json(info);
  } catch (err) {
    info.rest.error = String(err?.message || err);
    info.hint = "Errore di rete o URL Supabase errato.";
    return NextResponse.json(info);
  }
}
