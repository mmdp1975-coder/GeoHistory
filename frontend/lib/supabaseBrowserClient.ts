// frontend/lib/supabaseBrowserClient.ts
// Browser client singleton per Supabase (RLS lato client)

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (globalThis as any).__SUPABASE_URL__;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  (globalThis as any).__SUPABASE_ANON_KEY__;

if (!supabaseUrl || !supabaseAnonKey) {
  // Messaggio chiaro in dev: evita build/runtime silenziosi
  // Assicurati di avere nel .env.local:
  // NEXT_PUBLIC_SUPABASE_URL=
  // NEXT_PUBLIC_SUPABASE_ANON_KEY=
  throw new Error(
    "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
