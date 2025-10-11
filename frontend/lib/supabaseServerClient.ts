// lib/supabaseServerClient.ts
// USO: SOLO in route/server (mai in componenti client)

import type { SupabaseClient } from "@supabase/supabase-js";
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

/** Risolve la anon key in modo robusto (prima ENV, poi .env.local). */
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
 * ⚠️ Mai esporre al client. Non persiste la sessione.
 */
export const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Ritorna un Supabase SSR client basato su cookies.
 * - Se siamo in ambiente Next (headers/cookies disponibili), usa i relativi store
 * - Altrimenti, se viene passato un adapter cookies custom, usa quello
 * - Fallback: crea un server client con adapter cookies "vuoto" (per test/unit)
 */
export function getServerSupabase(cookies?: {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  remove(name: string, options: CookieOptions): void;
}): SupabaseClient {
  // Caso Next.js runtime: usa headers/cookies native APIs
  let nextHeadersFn: any = null;
  let nextCookiesFn: any = null;
  try {
    // import lazy per evitare errori in ambienti senza Next runtime
    const nh = require("next/headers");
    nextHeadersFn = nh.headers;
    nextCookiesFn = nh.cookies;
  } catch {
    // ignoriamo: non siamo in Next runtime
  }

  if (typeof nextHeadersFn === "function" && typeof nextCookiesFn === "function") {
    const cookieStore = nextCookiesFn();
    return createServerClient(supabaseUrl!, anonKey!, {
      cookies: {
        get(name: string) {
          try {
            const c = cookieStore.get(name);
            return c?.value;
          } catch {
            return undefined;
          }
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

  // Caso adapter custom fornito da chi invoca
  if (cookies) {
    return createServerClient(supabaseUrl!, anonKey!, {
      cookies: {
        get: cookies.get,
        set: cookies.set,
        remove: cookies.remove,
      },
    });
  }

  // Caso custom (test/unit)
  return createServerClient(supabaseUrl!, anonKey!, { cookies: {
    get: () => undefined,
    set: () => {},
    remove: () => {},
  } });
}

/**
 * ✅ EXPORT RICHIESTO DAL TUO CODICE
 * Thin wrapper per compatibilità con chi fa:
 *   import { createClient } from '@/lib/supabaseServerClient'
 * Restituisce un client SSR pronto all'uso in Server Actions / Route Handlers.
 */
export function createClient(): SupabaseClient {
  return getServerSupabase();
}
