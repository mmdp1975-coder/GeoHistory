// src/app/api/options/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** === Supabase client (niente pooler PG) === */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const ok  = (d) => NextResponse.json(d ?? [], { status: 200 });
const bad = (m, s = 400) => NextResponse.json({ error: m }, { status: s });

function normLang(v) {
  const L = String(v || "it").toLowerCase();
  return (L === "en" || L === "it") ? L : "it";
}

/** Dedup client-side e sort per label */
function uniqSortValueLabel(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const value = String(r.value || "").trim();
    const label = String(r.label || "").trim();
    if (value && label) map.set(value + "||" + label, { value, label });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const type = String(searchParams.get("type") || "").toLowerCase();
  const lang = normLang(searchParams.get("lang"));

  if (!type) return bad("Missing 'type'");

  try {
    if (type === "groups") {
      // Nella tua tabella: group_event_en, group_event_it (niente base)
      const { data, error } = await supabase
        .from("events")
        .select("group_event_en, group_event_it")
        .or("group_event_en.not.is.null,group_event_it.not.is.null")
        .limit(5000);
      if (error) throw error;

      const out = (data || []).map(r => {
        const value = (r.group_event_en || r.group_event_it || "").trim();
        const label = (lang === "it"
          ? (r.group_event_it || r.group_event_en || "")
          : (r.group_event_en || r.group_event_it || "")
        ).trim();
        return { value, label };
      });

      return ok(uniqSortValueLabel(out));
    }

    if (type === "continents") {
      const { data, error } = await supabase
        .from("events")
        .select("continent")
        .not("continent", "is", null)
        .neq("continent", "")
        .limit(5000);
      if (error) throw error;

      const out = (data || []).map(r => {
        const v = String(r.continent || "").trim();
        return { value: v, label: v };
      });
      return ok(uniqSortValueLabel(out));
    }

    if (type === "countries") {
      const { data, error } = await supabase
        .from("events")
        .select("country")
        .not("country", "is", null)
        .neq("country", "")
        .limit(5000);
      if (error) throw error;

      const out = (data || []).map(r => {
        const v = String(r.country || "").trim();
        return { value: v, label: v };
      });
      return ok(uniqSortValueLabel(out));
    }

    if (type === "locations") {
      const { data, error } = await supabase
        .from("events")
        .select("location")
        .not("location", "is", null)
        .neq("location", "")
        .limit(5000);
      if (error) throw error;

      const out = (data || []).map(r => {
        const v = String(r.location || "").trim();
        return { value: v, label: v };
      });
      return ok(uniqSortValueLabel(out));
    }

    return bad(`Unsupported 'type': ${type}`);
  } catch (err) {
    console.error("[/api/options] error:", err);
    return NextResponse.json(
      { error: "Internal error", detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}
