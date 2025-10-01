// frontend/lib/supabaseBrowserClient.ts
"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase per il BROWSER.
 * Usa le chiavi pubbliche. Non mettere qui la service-role key.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Evita crash di build; i dettagli appariranno in console runtime
  // (su Vercel setta le env in Project Settings → Environment Variables)
  // eslint-disable-next-line no-console
  console.warn("[supabaseBrowserClient] Missing NEXT_PUBLIC_* env vars");
}

export const supabase: SupabaseClient<any, any, any, any, any> = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

/**
 * Shim per compatibilità con importazioni legacy:
 * permette sia `import { supabase } from "..."`
 * sia `import supabase from "..."`.
 */
export default supabase;
