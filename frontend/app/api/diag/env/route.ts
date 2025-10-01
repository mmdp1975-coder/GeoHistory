// app/api/diag/env/route.ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function mask(s?: string | null) {
  if (!s) return "missing";
  if (s.length <= 14) return s;
  return s.slice(0, 8) + "..." + s.slice(-6);
}

export async function GET() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    let fileExists = fs.existsSync(envPath);
    let fileContent = fileExists ? fs.readFileSync(envPath, "utf8") : "";

    // Leggo le env viste da Next (process.env) e le maschero
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    const looksPlaceholder =
      key.includes("LA-TUA") || key.includes("SERVICE") || key.length < 60;

    return NextResponse.json({
      env_file_path: envPath,
      env_file_exists: fileExists,
      env_file_preview: fileContent
        .split("\n")
        .filter((l) => l.trim().startsWith("NEXT_PUBLIC_SUPABASE_URL=") || l.trim().startsWith("SUPABASE_SERVICE_ROLE_KEY="))
        .slice(0, 5), // mostro solo le 2 righe rilevanti
      // Valori letti dal processo (quelli che Next effettivamente usa)
      runtime_env: {
        NEXT_PUBLIC_SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY_masked: mask(key),
        SUPABASE_SERVICE_ROLE_KEY_length: key ? key.length : 0,
        looksPlaceholder,
      },
      hint:
        "Se looksPlaceholder=true o length<60, il valore della chiave non è la vera service_role (deve iniziare con 'eyJ' ed essere molto lunga, >100).",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
