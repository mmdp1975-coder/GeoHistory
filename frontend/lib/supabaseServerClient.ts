// lib/supabaseServerClient.ts
// USO: SOLO in route/server (mai in componenti client)

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Opzionali: utili in dev locale; in ambienti serverless/edge potrebbero non essere disponibili
let fsAvailable = false;
let fs: typeof import("fs") | null = null;
let path: typeof import("path") | null = null;
try {
  fs = require("fs");
  path = require("path");
  fsAvailable = true;
} catch {
  fsAvailable = false;
}

/** Leggi una variabile da .env.local (solo in dev, se file system disponibile). */
function readEnvLocalVar(name: string): string | null {
  try {
    if (!fsAvailable || !fs || !path) return null;
    const p = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, "utf8");
    const re = new RegExp(`^${name}=(.*)$`, "m");
    const m = txt.match(re);
    if (!m) return null;
    let v = (m[1] || "").trim();
    // rimuove eventuali apici
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v || null;
  } catch {
    return null;
  }
}

/** Risolve la service role key in modo robusto (prima ENV, poi .env.local). */
function resolveServiceRoleKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    readEnvLocalVar("SUPABASE_SERVICE_ROLE_KEY") ||
    null
  );
}

/** Risolve la anon key per il server client (prima ENV, poi .env.local). */
function resolveAnonKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    readEnvLocalVar("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    null
  );
}

/** Risolve l'URL del progetto Supabase (prima ENV, poi .env.local). */
function resolveSupabaseUrl(): string | null {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    readEnvLocalVar("NEXT_PUBLIC_SUPABASE_URL") ||
    null
  );
}

const supabaseUrl = resolveSupabaseUrl();
const serviceRoleKey = resolveServiceRoleKey();
const anonKey = resolveAnonKey();

if (!supabaseUrl) {
  throw new Error("ENV NEXT_PUBLIC_SUPABASE_URL mancante");
}
if (!serviceRoleKey || serviceRoleKey.length < 60) {
  throw new Error("ENV SUPABASE_SERVICE_ROLE_KEY mancante o non valida");
}
if (!anonKey) {
  throw new Error("ENV NEXT_PUBLIC_SUPABASE_ANON_KEY mancante");
}

/**
 * Client ADMIN (service-role): usalo SOLO in route server protette (es. /api/admin/*).
 * Disabilitiamo persistenza token e auto-refresh.
 */
export const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Client SERVER per leggere sessione utente nelle API (anon key + cookies).
 * Da usare dentro route handlers (Next.js App Router).
 */
export function getServerSupabase(cookies?: {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options: CookieOptions) => void;
  remove: (name: string, options: CookieOptions) => void;
}) {
  // Se non passano un gestore cookies, usiamo quello di Next (caricato lazy per evitare import lato edge quando non serve)
  if (!cookies) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const headers = require("next/headers");
    const cookieStore = headers.cookies();
    return createServerClient(supabaseUrl!, anonKey!, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {}
        },
      },
    });
  }

  // Caso custom (test/unit)
  return createServerClient(supabaseUrl!, anonKey!, { cookies });
}
