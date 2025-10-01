// app/api/diag/supabase/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function mask(s?: string | null) {
  if (!s) return "missing";
  if (s.length <= 14) return s;
  return s.slice(0, 8) + "..." + s.slice(-6);
}
function readEnvLocalVar(name: string): string | null {
  try {
    const p = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, "utf8");
    const re = new RegExp(`^${name}=(.*)$`, "m");
    const m = txt.match(re);
    if (!m) return null;
    let v = (m[1] || "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v || null;
  } catch { return null; }
}
function resolveServiceRoleKey(): { key: string; source: "process" | "file" | "none" } {
  let v = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const looksPlaceholder = /LA-TUA|SERVICE|PLACEHOLDER/i.test(v);
  if (v && v.length >= 60 && !looksPlaceholder) return { key: v, source: "process" };
  const fromFile = readEnvLocalVar("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (fromFile && fromFile.length >= 60) return { key: fromFile, source: "file" };
  return { key: v, source: "none" };
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const resolved = resolveServiceRoleKey();
    if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL mancante");
    if (!resolved.key || resolved.key.length < 60) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante o non valida");

    const supabase = createClient(url, resolved.key, { auth: { persistSession: false, autoRefreshToken: false } });

    // ping: prova prima "personas", se non c'è prova "widgets"
    const ping1 = await supabase.from("personas").select("id", { head: true, count: "exact" });
    const ok1 = ping1.status === 200 && !ping1.error;
    const ping2 = ok1 ? null : await supabase.from("widgets").select("id", { head: true, count: "exact" });

    return NextResponse.json({
      url,
      url_ok: url.startsWith("https://") && url.includes(".supabase.co"),
      key_source: resolved.source,
      key_length: resolved.key.length,
      key_masked: mask(resolved.key),
      ping_table: ok1 ? "personas" : "widgets",
      ping_status: ok1 ? ping1.status : (ping2 ? ping2.status : null),
      ping_error: ok1 ? null : (ping2?.error?.message || ping1.error?.message || null),
      ping_count: ok1 ? (ping1.count ?? null) : (ping2?.count ?? null),
    });
  } catch (e: any) {
    return NextResponse.json({ diag_error: e?.message || String(e) }, { status: 500 });
  }
}
