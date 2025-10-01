// lib/supabaseServerClient.ts
// USO: SOLO in route/server (mai in componenti client)
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function readEnvLocalVar(name: string): string | null {
  try {
    const p = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, "utf8");
    // trova la riga che inizia con NAME=
    const re = new RegExp(`^${name}=(.*)$`, "m");
    const m = txt.match(re);
    if (!m) return null;
    let v = (m[1] || "").trim();
    // rimuovi eventuali apici
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v || null;
  } catch {
    return null;
  }
}

function resolveServiceRoleKey(): string {
  // 1) prova da process.env
  let v = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const looksPlaceholder = /LA-TUA|SERVICE|PLACEHOLDER/i.test(v);
  if (!v || v.length < 60 || looksPlaceholder) {
    // 2) fallback: leggi dal file .env.local (root progetto)
    const fromFile = readEnvLocalVar("SUPABASE_SERVICE_ROLE_KEY");
    if (fromFile && fromFile.length >= 60 && !/LA-TUA|SERVICE|PLACEHOLDER/i.test(fromFile)) {
      v = fromFile;
    }
  }
  return v;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = resolveServiceRoleKey();

if (!supabaseUrl) {
  throw new Error("ENV NEXT_PUBLIC_SUPABASE_URL mancante");
}
if (!serviceRoleKey || serviceRoleKey.length < 60) {
  throw new Error("ENV SUPABASE_SERVICE_ROLE_KEY mancante o non valida");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
