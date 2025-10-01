// app/lib/supabaseAdmin.ts
// Runtime: Node.js (usa fs), SOLO per route server (app/api/*)
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v || null;
  } catch {
    return null;
  }
}

function resolveServiceRoleKey(): { key: string; source: "process" | "file" | "none" } {
  let v = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const looksPlaceholder = /LA-TUA|SERVICE|PLACEHOLDER/i.test(v);
  if (v && v.length >= 60 && !looksPlaceholder) {
    return { key: v, source: "process" };
  }
  const fromFile = readEnvLocalVar("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (fromFile && fromFile.length >= 60 && !/LA-TUA|SERVICE|PLACEHOLDER/i.test(fromFile)) {
    return { key: fromFile, source: "file" };
  }
  return { key: v, source: "none" };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const resolved = resolveServiceRoleKey();

if (!supabaseUrl) {
  throw new Error("ENV NEXT_PUBLIC_SUPABASE_URL mancante");
}
if (!resolved.key || resolved.key.length < 60) {
  console.error("❌ Service role non valida", {
    url: supabaseUrl,
    source: resolved.source,
    length: resolved.key ? resolved.key.length : 0,
    masked: mask(resolved.key),
  });
  throw new Error("ENV SUPABASE_SERVICE_ROLE_KEY mancante o non valida");
}

export const supabaseAdmin = createClient(supabaseUrl, resolved.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function debugServiceRoleSource() {
  return {
    url: supabaseUrl,
    key_source: resolved.source,
    key_length: resolved.key.length,
    key_masked: mask(resolved.key),
  };
}
