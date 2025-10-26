// frontend/lib/i18n/setDbLocale.ts
import { createClient } from "@/lib/supabase/server";

/**
 * Imposta la lingua DB in base al profilo utente.
 * Usa profiles.locale oppure profiles.language (prime 2 lettere).
 * Va chiamata prima di qualsiasi SELECT localizzata.
 */
export async function setDbLocaleFromProfile() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("locale, language")
    .eq("id", user.id)
    .single();

  if (profileErr) return;

  const locale =
    (profile?.locale ?? profile?.language ?? "en")
      .toString()
      .slice(0, 2)
      .toLowerCase();

  await supabase.rpc("set_request_locale", { p_locale: locale });
}
