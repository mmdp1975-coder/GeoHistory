// frontend/lib/i18n/setDbLocale.ts
// Imposta (in modo best-effort) la lingua lato DB in base al profilo utente.
// Compatibile con Next.js 14 (App Router) e con il tuo client server-side.

// ✅ Import corretto (niente createClient qui)
import { getServerSupabase } from "@/lib/supabase/server";

// Tipi minimi per evitare dipendenze
type SupabaseLike = {
  from: (table: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  rpc: (fn: string, args?: Record<string, any>) => Promise<{ error: any }>;
};

/**
 * setDbLocaleFromProfile
 * - Uso consigliato: passare esplicitamente il client server-side e il profileId.
 *   es: await setDbLocaleFromProfile(supabase, profileId)
 * - Compat: se chiamata senza argomenti, prova a ricavare client utente e profilo.
 *
 * @param supabase  Istanza server-side (opzionale)
 * @param profileId UUID profilo (opzionale)
 */
export async function setDbLocaleFromProfile(
  supabase?: SupabaseLike | null,
  profileId?: string | null
): Promise<void> {
  // 1) Risolvi il client server-side
  const sb: SupabaseLike | null = (supabase as SupabaseLike) ?? (getServerSupabase() as unknown as SupabaseLike);
  if (!sb) return;

  // 2) Recupera l'id profilo se non fornito (best-effort)
  let pid = profileId ?? null;
  if (!pid) {
    try {
      const { data } = await sb.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (uid) {
        // Se il tuo schema profili usa una chiave diversa, adegua qui:
        const { data: rows, error } = await sb
          .from("profiles")
          .select("id")
          .eq("user_id", uid)
          .limit(1);
        if (!error && Array.isArray(rows) && rows.length > 0) {
          pid = rows[0]?.id ?? null;
        }
      }
    } catch {
      // ignora: fallback silenzioso
    }
  }

  // 3) Leggi la lingua dal profilo (2-letter o il tuo campo reale)
  let lang2: string | null = null;
  if (pid) {
    try {
      const { data: rows, error } = await (sb as any)
        .from("profiles")
        .select("language_code")
        .eq("id", pid)
        .limit(1);
      if (!error && Array.isArray(rows) && rows.length > 0) {
        const raw = rows[0]?.language_code as string | null;
        lang2 = (raw ?? "").slice(0, 2).toLowerCase() || null;
      }
    } catch {
      // ignora
    }
  }

  if (!lang2) return;

  // 4) Prova a impostare la lingua lato DB (se esiste una RPC dedicata)
  //    Questo è best-effort: non fallire la pagina se la RPC non esiste.
  try {
    // Esempio di funzione lato DB (se l’hai definita):
    // create or replace function public.set_client_locale(p_locale text) ...
    await sb.rpc("set_client_locale", { p_locale: lang2 });
  } catch {
    // Se non esiste la RPC o non serve, non bloccare il flusso.
  }
}

export default setDbLocaleFromProfile;
