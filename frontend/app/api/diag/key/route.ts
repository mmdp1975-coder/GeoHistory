// app/api/diag/key/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
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
  } catch {
    return null;
  }
}

export async function GET() {
  const fromProcess = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const fromFile = readEnvLocalVar("SUPABASE_SERVICE_ROLE_KEY") || "";
  const looksPlaceholder = /LA-TUA|SERVICE|PLACEHOLDER/i.test(fromProcess);

  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    service_role: {
      fromProcess_masked: mask(fromProcess),
      fromProcess_length: fromProcess.length || 0,
      fromProcess_looksPlaceholder: looksPlaceholder,
      fromFile_masked: mask(fromFile),
      fromFile_length: fromFile.length || 0,
      picked: (fromProcess && !looksPlaceholder && fromProcess.length >= 60) ? "process" :
              (fromFile && fromFile.length >= 60) ? "file" : "none",
    },
  });
}
