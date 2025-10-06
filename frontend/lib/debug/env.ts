import fs from "fs";
import path from "path";

export function mask(value?: string | null) {
  if (!value) return "missing";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function readEnvLocalVar(name: string): string | null {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return null;
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(new RegExp(`^${name}=(.*)$`, "m"));
    if (!match) return null;
    let value = (match[1] || "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value || null;
  } catch {
    return null;
  }
}

export function resolveSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvLocalVar("NEXT_PUBLIC_SUPABASE_URL") || "";
}

export function resolveServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvLocalVar("SUPABASE_SERVICE_ROLE_KEY") || "";
}

export function resolveAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || readEnvLocalVar("NEXT_PUBLIC_SUPABASE_ANON_KEY") || "";
}

export function loadEnvLocalLines(names: string[]) {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return { path: envPath, exists: false, lines: [] as string[] };
    const content = fs.readFileSync(envPath, "utf8");
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => names.some((name) => line.startsWith(`${name}=`)))
      .slice(0, 20);
    return { path: envPath, exists: true, lines };
  } catch {
    return { path: path.join(process.cwd(), ".env.local"), exists: false, lines: [] as string[] };
  }
}
