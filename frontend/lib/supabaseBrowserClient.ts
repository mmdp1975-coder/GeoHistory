// frontend/lib/supabaseBrowserClient.ts
// ✅ SSR-safe & client singleton
// - Non lancia errori in import SSR/prerender
// - In browser crea/riusa UN'UNICA istanza (window.__geo_supabase__)
// - Persistenza su localStorage + auto refresh
// - Export con NOME: { supabase }

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// (sostituisci 'any' con il tipo generato del tuo DB se disponibile)
type Db = any;

declare global {
  interface Window {
    __geo_supabase__?: SupabaseClient<Db>;
    supabase?: SupabaseClient<Db>;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function makeClient(): SupabaseClient<Db> {
  return createClient<Db>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      flowType: "pkce",
    },
  });
}

// ⚠️ NON lanciare errori durante l'import SSR:
//    - in SSR esportiamo un "placeholder" che lancia SOLO se usato.
//    - in browser creiamo/riusiamo l'istanza reale.
let client: SupabaseClient<Db>;

if (typeof window !== "undefined") {
  client = window.__geo_supabase__ ?? (window.__geo_supabase__ = makeClient());
  // utile per debug da Console in prod
  (window as any).supabase = client;
} else {
  client = new Proxy({} as SupabaseClient<Db>, {
    get() {
      throw new Error(
        "supabaseBrowserClient è client-only: sposta questa chiamata in un componente 'use client' o usa il client server-side."
      );
    },
  });
}

export const supabase = client;
