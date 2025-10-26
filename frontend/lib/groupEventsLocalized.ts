// frontend/lib/groupEventsLocalized.ts
// Supporta sia setDbLocaleFromProfile() (0 arg) sia setDbLocaleFromProfile(sb, profileId) (2 arg)

import { getServerSupabase } from "@/lib/supabase/server";
import { setDbLocaleFromProfile } from "@/lib/i18n/setDbLocale";

export type GroupEventLocalized = {
  id: string;
  code: string | null;
  slug: string | null;
  title: string | null;
  pitch: string | null;
  translation_lang2: string | null;
  translation_title: string | null;
  translation_pitch: string | null;
  updated_at: string | null;
  created_at: string | null;
};

async function ensureLocale(supabase: unknown, profileId: string | null) {
  // 1) prova firma a 0 argomenti
  try {
    // @ts-ignore - compat: alcune versioni espongono una funzione senza parametri
    const r0 = setDbLocaleFromProfile();
    if (r0 && typeof r0.then === "function") {
      await r0;
      return;
    }
  } catch {
    // ignora e prova fallback
  }

  // 2) fallback firma a 2 argomenti
  try {
    // @ts-ignore - compat: altre versioni richiedono (supabase, profileId)
    await setDbLocaleFromProfile(supabase, profileId);
  } catch {
    // se anche questo fallisce, non bloccare la query
  }
}

export async function getGroupEventsLocalized(profileId: string | null) {
  const supabase = getServerSupabase();
  if (!supabase) {
    throw new Error("Supabase client not initialized (server-side).");
  }

  await ensureLocale(supabase, profileId);

  const { data, error } = await supabase
    .from("v_journeys")
    .select(
      "id, code, slug, title, pitch, translation_lang2, translation_title, translation_pitch, updated_at, created_at"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching group events localized:", error);
    throw error;
  }

  return (data ?? []) as GroupEventLocalized[];
}
