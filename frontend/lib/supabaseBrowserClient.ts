// frontend/supabaseBrowserClient.ts
"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    supabase?: SupabaseClient;
  }
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  (globalThis as any).NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (globalThis as any).NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getProjectRef(url?: string) {
  try {
    const h = new URL(url!).hostname; // es: jcqaesoavmxucexjeudq.supabase.co
    return h.split(".")[0];
  } catch {
    return undefined;
  }
}

function detectExistingStorageKey(url?: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const keys = Object.keys(localStorage).filter(
    (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
  );
  if (!keys.length) return undefined;

  // Preferisci quella del projectRef corrente, se la trovi
  const ref = getProjectRef(url);
  if (ref) {
    const match = keys.find((k) => k.startsWith(`sb-${ref}-`));
    if (match) return match;
  }
  // Altrimenti usa la prima disponibile
  return keys[0];
}

function getBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  }
  if (window.supabase) return window.supabase;

  const storageKey = detectExistingStorageKey(SUPABASE_URL);

  // Se troviamo una chiave esistente, la riusiamo; altrimenti lasciamo che la SDK usi la sua chiave di default
  const client =
    storageKey
      ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
          auth: { persistSession: true, storageKey },
          global: { headers: { "x-gehj-client": "browser-singleton" } },
        })
      : createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
          auth: { persistSession: true },
          global: { headers: { "x-gehj-client": "browser-singleton" } },
        });

  window.supabase = client;
  return client;
}

export const supabase = getBrowserClient();
export default supabase;
