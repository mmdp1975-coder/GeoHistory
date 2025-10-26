// frontend/lib/groupEventsLocalized.ts
import { createClient } from "@/lib/supabase/server";
import { setDbLocaleFromProfile } from "@/lib/i18n/setDbLocale";

export type GroupEventLocalized = {
  id: string;
  code: string | null;
  slug: string | null;
  pitch: string | null;
  cover_url: string | null;
  visibility: "private" | "public" | null;
  created_at: string | null;
  updated_at: string | null;
  workflow_state: "draft" | "submitted" | "refused" | "published" | null;
  owner_profile_id: string | null;
  requested_approval_at: string | null;
  approved_at: string | null;
  approved_by_profile_id: string | null;
  refused_at: string | null;
  refused_by_profile_id: string | null;
  refusal_reason: string | null;
  i18n_lang: string | null;
  title: string | null;
  short_name: string | null;
  description: string | null;
  video_url: string | null;
};

export async function listGroupEventsLocalized(params?: {
  orderBy?: { column: keyof GroupEventLocalized; ascending?: boolean };
  limit?: number;
  offset?: number;
}) {
  const supabase = createClient();

  // 1) imposta lingua dalla sessione utente
  await setDbLocaleFromProfile();

  // 2) leggi dalla view localizzata (RLS già applicate)
  let q = supabase.from("v_group_events").select("*");

  if (params?.orderBy) {
    q = q.order(params.orderBy.column as string, {
      ascending: params.orderBy.ascending ?? true,
    });
  }
  if (typeof params?.limit === "number") q = q.limit(params.limit);
  if (typeof params?.offset === "number") {
    const from = params.offset;
    const to = params.offset + (params.limit ?? 100) - 1;
    q = q.range(from, to);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data as GroupEventLocalized[];
}

export async function getGroupEventLocalized(id: string) {
  const supabase = createClient();

  await setDbLocaleFromProfile();

  const { data, error } = await supabase
    .from("v_group_events")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as GroupEventLocalized;
}
