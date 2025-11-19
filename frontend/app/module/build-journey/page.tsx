
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveJourney, type SaveJourneyPayload } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Scorecard } from "@/app/components/Scorecard";

type Visibility = "private" | "public";

const DEFAULT_LANGUAGE = "it";
type JourneySummary = {
  id: string;
  title: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  eventsCount?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  owner_profile_id?: string | null;
};

type VJourneyRow = {
  journey_id: string;
  journey_slug: string | null;
  journey_cover_url: string | null;
  translation_title: string | null;
  approved_at: string | null;
  events_count: number | null;
  year_from_min: number | null;
  year_to_max: number | null;
};

type AllowFlagKey = "allow_fan" | "allow_stud_high" | "allow_stud_middle" | "allow_stud_primary";

type GroupEventTranslationState = {
  lang: string;
  title: string;
  short_name: string;
  description: string;
  video_url: string;
};

type ProfileNameRow = {
  id: string;
  full_name: string | null;
  username: string | null;
};

const EMPTY_GROUP_EVENT: SaveJourneyPayload["group_event"] = {
  title: "",
  cover_url: "",
  visibility: "private",
  status: "draft",
  pitch: "",
  description: "",
  language: DEFAULT_LANGUAGE,
  slug: "",
  code: "",
  workflow_state: "draft",
  owner_profile_id: "",
  requested_approval_at: "",
  approved_at: "",
  approved_by_profile_id: "",
  refused_at: "",
  refused_by_profile_id: "",
  refusal_reason: "",
  allow_fan: false,
  allow_stud_high: false,
  allow_stud_middle: false,
  allow_stud_primary: false,
  created_at: "",
  updated_at: "",
};

const EMPTY_GROUP_EVENT_TRANSLATION: GroupEventTranslationState = {
  lang: DEFAULT_LANGUAGE,
  title: "",
  short_name: "",
  description: "",
  video_url: "",
};

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00`;
  }
  const normalized = trimmed.replace(" ", "T");
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  if (match) {
    return match[0];
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 16);
  }
  return "";
}

function fromDateTimeLocalValue(value: string): string {
  return value ? value.replace("T", " ") : "";
}


export default function BuildJourneyPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, checking, error: profileError } = useCurrentUser();

  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [journeysError, setJourneysError] = useState<string | null>(null);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [loadingJourneyDetails, setLoadingJourneyDetails] = useState(false);
  const [journeyDetailsError, setJourneyDetailsError] = useState<string | null>(null);

  const [ge, setGe] = useState<SaveJourneyPayload["group_event"]>(() => ({ ...EMPTY_GROUP_EVENT }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<{ id: string } | null>(null);
  const [translation, setTranslation] = useState<GroupEventTranslationState>(() => ({ ...EMPTY_GROUP_EVENT_TRANSLATION }));
  const [translations, setTranslations] = useState<GroupEventTranslationState[]>([
    { ...EMPTY_GROUP_EVENT_TRANSLATION, lang: DEFAULT_LANGUAGE },
  ]);
  const [selectedTranslationLang, setSelectedTranslationLang] = useState<string>(DEFAULT_LANGUAGE);
  const [newTranslationLang, setNewTranslationLang] = useState("");
  const [deletedTranslationLangs, setDeletedTranslationLangs] = useState<string[]>([]);
  const existingTranslationLangsRef = useRef<string[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const selectedJourney = useMemo(() => journeys.find((j) => j.id === selectedJourneyId) ?? null, [journeys, selectedJourneyId]);

  const resetForm = useCallback(() => {
    setGe({ ...EMPTY_GROUP_EVENT, owner_profile_id: profile?.id || "" });
    setJourneyDetailsError(null);
    setTranslation({ ...EMPTY_GROUP_EVENT_TRANSLATION, lang: DEFAULT_LANGUAGE });
    setSelectedTranslationLang(DEFAULT_LANGUAGE);
    setTranslations([]);
  }, [profile?.id]);

  const handleNewJourney = () => {
    setSelectedJourneyId(null);
    resetForm();
    setSaveError(null);
    setSaveOk(null);
  };

  const loadJourneys = useCallback(async () => {
    if (!profile?.id) {
      return;
    }
    setJourneysLoading(true);
    setJourneysError(null);
    try {
      const { data: owned, error: ownedError } = await supabase
        .from("group_events")
        .select("id")
        .eq("owner_profile_id", profile.id);
      if (ownedError) throw ownedError;
      const ownerIds = (owned ?? []).map((row) => row.id).filter(Boolean);
      if (!ownerIds.length) {
        setJourneys([]);
        return;
      }
      const { data: rows, error } = await supabase
        .from("v_journeys")
        .select("journey_id,journey_cover_url,translation_title,approved_at,events_count,year_from_min,year_to_max")
        .in("journey_id", ownerIds)
        .order("approved_at", { ascending: false });
      if (error) throw error;
      const journeysFromView = (rows ?? []) as VJourneyRow[];
      setJourneys(
        journeysFromView.map((journey) => ({
          id: journey.journey_id,
          title: journey.translation_title ?? null,
          coverUrl: journey.journey_cover_url ?? null,
          publishedAt: journey.approved_at,
          eventsCount: journey.events_count,
          yearFrom: journey.year_from_min,
          yearTo: journey.year_to_max,
          owner_profile_id: profile.id,
        }))
      );
    } catch (err: any) {
      setJourneysError(err?.message || "Impossibile caricare i journeys.");
    } finally {
      setJourneysLoading(false);
    }
  }, [profile?.id, supabase]);

  const loadJourneyDetails = useCallback(async (journeyId: string | null) => {
    if (!journeyId) {
      return;
    }
    setLoadingJourneyDetails(true);
    setJourneyDetailsError(null);
    try {
      const { data: base, error: baseError } = await supabase.from("group_events").select("*").eq("id", journeyId).maybeSingle();
      if (baseError) throw baseError;
      if (!base) {
        throw new Error("Journey non trovato.");
      }
      const language = (base.language as string) || DEFAULT_LANGUAGE;
      setGe((prev) => ({
        ...prev,
        cover_url: base.cover_url || "",
        visibility: (base.visibility || "private") as Visibility,
        status: (base.status as "draft" | "published") ?? prev.status,
        pitch: base.pitch || "",
        description: base.description || "",
        language,
        slug: base.slug || "",
        code: base.code || "",
        workflow_state: base.workflow_state || prev.workflow_state || "draft",
        owner_profile_id: base.owner_profile_id || prev.owner_profile_id || profile?.id || "",
        allow_fan: base.allow_fan ?? prev.allow_fan ?? false,
        allow_stud_high: base.allow_stud_high ?? prev.allow_stud_high ?? false,
        allow_stud_middle: base.allow_stud_middle ?? prev.allow_stud_middle ?? false,
        allow_stud_primary: base.allow_stud_primary ?? prev.allow_stud_primary ?? false,
        requested_approval_at: base.requested_approval_at || "",
        approved_at: base.approved_at || "",
        approved_by_profile_id: base.approved_by_profile_id || "",
        refused_at: base.refused_at || "",
        refused_by_profile_id: base.refused_by_profile_id || "",
        refusal_reason: base.refusal_reason || "",
        created_at: base.created_at || "",
        updated_at: base.updated_at || "",
      }));

      const { data: translationsData, error: translationsError } = await supabase
        .from("group_event_translations")
        .select("lang,title,short_name,description,video_url")
        .eq("group_event_id", journeyId);
      if (translationsError) throw translationsError;
      const normalized = (translationsData ?? [])
        .map((row) => ({
          lang: (row.lang || "").trim(),
          title: row.title || "",
          short_name: row.short_name || "",
          description: row.description || "",
          video_url: row.video_url || "",
        }))
        .filter((row) => row.lang);
      const translationsForUI =
        normalized.length > 0
          ? normalized
          : [{ ...EMPTY_GROUP_EVENT_TRANSLATION, lang: DEFAULT_LANGUAGE }];
      setTranslations(translationsForUI);
      existingTranslationLangsRef.current = normalized.map((row) => row.lang);
      const mainTranslation =
        translationsForUI.find((row) => row.lang === DEFAULT_LANGUAGE) ?? translationsForUI[0];
      if (mainTranslation) {
        setSelectedTranslationLang(mainTranslation.lang);
        setTranslation({
          lang: mainTranslation.lang,
          title: mainTranslation.title || "",
          short_name: mainTranslation.short_name || "",
          description: mainTranslation.description || "",
          video_url: mainTranslation.video_url || "",
        });
      } else {
        setSelectedTranslationLang(DEFAULT_LANGUAGE);
        setTranslation({ ...EMPTY_GROUP_EVENT_TRANSLATION, lang: DEFAULT_LANGUAGE });
      }
      setNewTranslationLang("");
      setDeletedTranslationLangs([]);

    } catch (err: any) {
      setJourneyDetailsError(err?.message || "Errore durante il caricamento dei dettagli.");
    } finally {
      setLoadingJourneyDetails(false);
    }
  }, [supabase, profile?.id]);

  useEffect(() => {
    loadJourneys();
  }, [loadJourneys]);

  useEffect(() => {
    if (profile?.id) {
      setGe((prev) => ({ ...prev, owner_profile_id: prev.owner_profile_id || profile.id }));
    }
  }, [profile?.id]);

  useEffect(() => {
    const ids = [
      ge.owner_profile_id,
      ge.approved_by_profile_id,
      ge.refused_by_profile_id,
    ].filter((id): id is string => Boolean(id));
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      return;
    }
    const pendingIds = uniqueIds.filter((id) => !profileNames[id]);
    if (!pendingIds.length) {
      return;
    }

    let isActive = true;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", pendingIds);
      if (!isActive) return;
      if (error) {
        console.error("Errore caricamento profili:", error.message);
        return;
      }
      if (!data || !data.length) {
        return;
      }
      const rows = data as ProfileNameRow[];
      setProfileNames((prev) => {
        const next = { ...prev };
        rows.forEach((row) => {
          const label = (row.full_name || row.username || row.id || "").trim();
          if (label) {
            next[row.id] = label;
          }
        });
        return next;
      });
    })();

    return () => {
      isActive = false;
    };
  }, [
    ge.approved_by_profile_id,
    ge.owner_profile_id,
    ge.refused_by_profile_id,
    profileNames,
    supabase,
  ]);

  const getProfileDisplayName = useCallback(
    (id?: string | null) => {
      if (!id) return "";
      return profileNames[id] ?? "";
    },
    [profileNames],
  );

  const selectTranslation = useCallback(
    (lang: string) => {
      const tr = translations.find((row) => row.lang === lang);
      if (!tr) {
        return;
      }
      setSelectedTranslationLang(tr.lang);
      setTranslation({
        lang: tr.lang,
        title: tr.title || "",
        short_name: tr.short_name || "",
        description: tr.description || "",
        video_url: tr.video_url || "",
      });
    },
    [translations],
  );

  const updateTranslationField = useCallback(
    (field: keyof GroupEventTranslationState, value: string) => {
      if (!selectedTranslationLang) return;
      setTranslation((prev) => {
        const next = { ...prev, [field]: value };
        setTranslations((prevTranslations) =>
          prevTranslations.map((row) =>
            row.lang === selectedTranslationLang ? { ...row, [field]: value } : row,
          ),
        );
        return next;
      });
    },
    [selectedTranslationLang],
  );

  const addTranslation = useCallback(() => {
    const trimmedLang = newTranslationLang.trim();
    if (!trimmedLang) {
      return;
    }
    const normalizedLang = trimmedLang.toLowerCase();
    const existingEntry = translations.find(
      (row) => row.lang.toLowerCase() === normalizedLang,
    );
    setNewTranslationLang("");
    if (existingEntry) {
      selectTranslation(existingEntry.lang);
      return;
    }
    const newEntry: GroupEventTranslationState = { ...EMPTY_GROUP_EVENT_TRANSLATION, lang: trimmedLang };
    setTranslations((prev) => [...prev, newEntry]);
    setSelectedTranslationLang(newEntry.lang);
    setTranslation(newEntry);
  }, [newTranslationLang, selectTranslation, translations]);

  const removeTranslation = useCallback(() => {
    if (!selectedTranslationLang) return;
    const next = translations.filter((row) => row.lang !== selectedTranslationLang);
    if (next.length) {
      const nextTranslation = next[0];
      setTranslations(next);
      setSelectedTranslationLang(nextTranslation.lang);
      setTranslation(nextTranslation);
    } else {
      const fallback = { ...EMPTY_GROUP_EVENT_TRANSLATION, lang: DEFAULT_LANGUAGE };
      setTranslations([fallback]);
      setSelectedTranslationLang(fallback.lang);
      setTranslation(fallback);
    }
    if (existingTranslationLangsRef.current.includes(selectedTranslationLang)) {
      setDeletedTranslationLangs((prev) =>
        prev.includes(selectedTranslationLang) ? prev : [...prev, selectedTranslationLang],
      );
      existingTranslationLangsRef.current = existingTranslationLangsRef.current.filter(
        (lang) => lang !== selectedTranslationLang,
      );
    }
  }, [selectedTranslationLang, translations]);

  const selectJourney = useCallback((journeyId: string) => {
    setSelectedJourneyId(journeyId);
  }, []);

  useEffect(() => {
    if (selectedJourneyId) {
      setJourneyDetailsError(null);
      setSaveError(null);
      setSaveOk(null);
      void loadJourneyDetails(selectedJourneyId);
    } else {
      resetForm();
    }
  }, [selectedJourneyId, loadJourneyDetails, resetForm]);

  useEffect(() => {
    if (!selectedJourney) {
      return;
    }
    setGe((prev) => ({
      ...prev,
      title: selectedJourney.title ?? prev.title,
    }));
  }, [selectedJourney]);

  useEffect(() => {
    setGe((prev) => ({
      ...prev,
      title: translation.title,
    }));
  }, [translation.title]);

  const canSaveMetadata =
    (ge.slug ?? "").trim().length > 0 && (ge.code ?? "").trim().length > 0;

  const canSaveJourney = canSaveMetadata;

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);

    if (!canSaveMetadata) {
      setSaveError("Compila slug e codice per salvare il journey.");
      setSaving(false);
      return;
    }

    const translationsToSave = translations.concat(
      translations.some((row) => row.lang === translation.lang) ? [] : [translation],
    );
    const translationPayloads = translationsToSave
      .map((row) => ({
        lang: row.lang?.trim() ?? "",
        title: row.title || undefined,
        short_name: row.short_name || undefined,
        description: row.description || undefined,
        video_url: row.video_url || undefined,
      }))
      .filter((row) => row.lang);

    const payload: SaveJourneyPayload = {
      group_event_id: selectedJourneyId ?? undefined,
      group_event: {
        title: ge.title,
        cover_url: ge.cover_url,
        visibility: ge.visibility,
        status: ge.status,
        pitch: ge.pitch || undefined,
        description: ge.description || undefined,
        language: ge.language || DEFAULT_LANGUAGE,
        slug: ge.slug || undefined,
        code: ge.code || undefined,
        workflow_state: ge.workflow_state,
        owner_profile_id: ge.owner_profile_id || profile?.id || undefined,
        requested_approval_at: ge.requested_approval_at || undefined,
        approved_at: ge.approved_at || undefined,
        approved_by_profile_id: ge.approved_by_profile_id || undefined,
        refused_at: ge.refused_at || undefined,
        refused_by_profile_id: ge.refused_by_profile_id || undefined,
        refusal_reason: ge.refusal_reason || undefined,
        allow_fan: ge.allow_fan,
        allow_stud_high: ge.allow_stud_high,
        allow_stud_middle: ge.allow_stud_middle,
        allow_stud_primary: ge.allow_stud_primary,
      },
      group_event_translations: translationPayloads.length ? translationPayloads : undefined,
      deleted_group_event_translation_langs:
        deletedTranslationLangs.length > 0 ? deletedTranslationLangs : undefined,
      video_media_url: null,
      events: [],
    };

    try {
      const res = await saveJourney(payload);
      setSaveOk({ id: res.group_event_id });
      setSelectedJourneyId(res.group_event_id);
      await loadJourneys();
      await loadJourneyDetails(res.group_event_id);
    } catch (err: any) {
      setSaveError(err?.message || "Errore di salvataggio.");
    } finally {
      setSaving(false);
    }
  }


  const renderGroupEventPage = () => {
    const allowFlags: { key: AllowFlagKey; label: string }[] = [
      { key: "allow_fan", label: "Allow fan" },
      { key: "allow_stud_high", label: "Allow stud high" },
      { key: "allow_stud_middle", label: "Allow stud middle" },
      { key: "allow_stud_primary", label: "Allow stud primary" },
    ];

    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6">
                <p className="text-sm font-semibold text-neutral-700">Dati identificativi</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input
                    label="Slug"
                    value={ge.slug}
                    onChange={(value) => setGe((prev) => ({ ...prev, slug: value }))}
                    placeholder="Es. age-of-exploration"
                  />
                  <Input
                    label="Code"
                    value={ge.code}
                    onChange={(value) => setGe((prev) => ({ ...prev, code: value }))}
                    placeholder="Es. EXP001"
                  />
                  <Select
                    label="Visibility"
                    value={ge.visibility}
                    onChange={(value) => setGe((prev) => ({ ...prev, visibility: value as Visibility }))}
                    options={[
                      { value: "private", label: "Private" },
                      { value: "public", label: "Public" },
                    ]}
                  />
                  <Select
                    label="Workflow state"
                    value={ge.workflow_state || "draft"}
                    onChange={(value) => setGe((prev) => ({ ...prev, workflow_state: value }))}
                    options={[
                      { value: "draft", label: "Draft" },
                      { value: "submitted", label: "Submitted" },
                      { value: "refused", label: "Refused" },
                      { value: "published", label: "Published" },
                    ]}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6">
                <p className="text-sm font-semibold text-neutral-700">Audience flags</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allowFlags.map((flag) => (
                    <label
                      key={flag.key}
                      className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-600"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
                        checked={!!ge[flag.key]}
                        onChange={(event) => setGe((prev) => ({ ...prev, [flag.key]: event.target.checked }))}
                      />
                      <span>{flag.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6 space-y-5">
                <ProfileField
                  label="Owner profile"
                  profileId={ge.owner_profile_id}
                  displayName={getProfileDisplayName(ge.owner_profile_id)}
                />
                <div className="grid gap-6 md:grid-cols-3">
                  <Input
                    label="Requested approval at"
                    type="datetime-local"
                    value={toDateTimeLocalValue(ge.requested_approval_at)}
                    onChange={(value) =>
                      setGe((prev) => ({ ...prev, requested_approval_at: fromDateTimeLocalValue(value) }))
                    }
                  />
                  <Input
                    label="Approved at"
                    type="datetime-local"
                    value={toDateTimeLocalValue(ge.approved_at)}
                    onChange={(value) => setGe((prev) => ({ ...prev, approved_at: fromDateTimeLocalValue(value) }))}
                  />
                  <Input
                    label="Refused at"
                    type="datetime-local"
                    value={toDateTimeLocalValue(ge.refused_at)}
                    onChange={(value) => setGe((prev) => ({ ...prev, refused_at: fromDateTimeLocalValue(value) }))}
                  />
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <ProfileField
                    label="Approved by profile"
                    profileId={ge.approved_by_profile_id}
                    displayName={getProfileDisplayName(ge.approved_by_profile_id)}
                    className="w-full"
                  />
                  <ProfileField
                    label="Refused by profile"
                    profileId={ge.refused_by_profile_id}
                    displayName={getProfileDisplayName(ge.refused_by_profile_id)}
                    className="w-full"
                  />
                </div>
                <Textarea
                  label="Refusal reason"
                  value={ge.refusal_reason}
                  onChange={(value) => setGe((prev) => ({ ...prev, refusal_reason: value }))}
                  placeholder="Spiega perch? ? stato rifiutato"
                />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
            <div className="grid gap-6 lg:grid-cols-[200px,1fr]">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Lingue</p>
                <div className="mt-4 space-y-2">
                  {translations.length === 0 ? (
                    <p className="text-sm text-neutral-500">Nessuna traduzione disponibile.</p>
                  ) : (
                    translations.map((tr) => {
                      const isActive = tr.lang === selectedTranslationLang;
                      return (
                        <button
                          key={tr.lang}
                          type="button"
                          onClick={() => selectTranslation(tr.lang)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                            isActive
                              ? "border-sky-500 bg-sky-50 text-sky-700 shadow-sm"
                              : "border-neutral-200 bg-white text-neutral-700"
                          }`}
                        >
                          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">{tr.lang}</p>
                          <p className="mt-1 text-sm font-semibold text-neutral-900">{tr.title || "(Untitled)"}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Lingua attiva: {selectedTranslationLang || "-"}
                </p>
                <div className="grid gap-6 md:grid-cols-2">
                  <Input
                    label="Title"
                    value={translation.title}
                    onChange={(value) => updateTranslationField("title", value)}
                    placeholder="Titolo pubblico"
                  />
                  <Input
                    label="Short name"
                    value={translation.short_name}
                    onChange={(value) => updateTranslationField("short_name", value)}
                    placeholder="Nome breve"
                  />
                </div>
                <Textarea
                  label="Description"
                  value={translation.description}
                  onChange={(value) => updateTranslationField("description", value)}
                  placeholder="Descrizione estesa"
                  className="mt-3"
                />
                <Input
                  label="Video URL"
                  value={translation.video_url}
                  onChange={(value) => updateTranslationField("video_url", value)}
                  placeholder="https://"
                  className="mt-3"
                />
              </div>
            </div>
            <div className="mt-6 border-t border-neutral-200 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] text-neutral-500">Created at</p>
                  <p className="text-sm text-neutral-700">{ge.created_at || "---"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-neutral-500">Updated at</p>
                  <p className="text-sm text-neutral-700">{ge.updated_at || "---"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <aside className="flex w-full max-w-[320px] flex-col border-r border-neutral-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-neutral-200 px-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Journeys</p>
              <h2 className="text-lg font-semibold text-neutral-900">Build hub</h2>
            </div>
            <button className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold" onClick={handleNewJourney}>
              New
            </button>
          </div>
          <p className="text-xs text-neutral-500">{journeys.length} saved</p>
          <p className="text-xs text-neutral-400">Seleziona un journey salvato per caricarne i campi e modificarli.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {journeysLoading ? (
            <p className="text-sm text-neutral-500">Caricamento journeysâ€¦</p>
          ) : journeysError ? (
            <p className="text-sm text-red-600">{journeysError}</p>
          ) : journeys.length === 0 ? (
            <p className="text-sm text-neutral-500">Nessun journey salvato. Crea un nuovo flow.</p>
          ) : (
            <ul className="space-y-3">
              {journeys.map((journey) => (
      <Scorecard
        key={journey.id}
        title={journey.title || "(Untitled journey)"}
        coverUrl={journey.coverUrl ?? undefined}
        publishedAt={journey.publishedAt ?? null}
        eventsCount={journey.eventsCount ?? null}
        yearFrom={journey.yearFrom ?? null}
        yearTo={journey.yearTo ?? null}
        ctaLabel="Modifica"
        className={`w-full ${selectedJourneyId === journey.id ? "border-sky-500 bg-sky-50" : ""}`}
        favouriteToggleDisabled
        usePlainImg
        onCardClick={() => selectJourney(journey.id)}
      />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-neutral-200 px-4 py-4 text-xs text-neutral-500">
          {checking
            ? "Verifico la sessioneâ€¦"
            : profile
            ? `Profile: ${profile.id}`
            : profileError
            ? profileError
            : "Effettua il login per salvare i journeys."}
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Journey builder</p>
            <h1 className="text-2xl font-semibold text-neutral-900">Costruisci il tuo journey</h1>
            <p className="text-sm text-neutral-500">
              {selectedJourney ? `Editing: ${selectedJourney.title || selectedJourney.id}` : "Nuovo journey"}
            </p>
          </div>
          <div className="text-xs text-neutral-500">{saveOk ? `Ultimo salvataggio: ${saveOk.id}` : "Salva il journey quando hai finito"}</div>
        </div>
        <div className="space-y-4">
          {selectedJourneyId && loadingJourneyDetails && (
            <p className="text-sm text-neutral-500">Caricamento campi del journey selezionatoâ€¦</p>
          )}
          {journeyDetailsError && <p className="text-sm text-red-600">{journeyDetailsError}</p>}
          {renderGroupEventPage()}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-neutral-500">
            {canSaveJourney ? "Tutti i dati sono pronti per essere salvati." : "Compila slug e codice per salvare il journey."}
          </div>
          <button
            className={`rounded-2xl px-5 py-2 text-sm font-semibold ${canSaveJourney && !saving ? "bg-neutral-900 text-white" : "bg-neutral-300 text-neutral-500"}`}
            disabled={!canSaveJourney || saving}
            onClick={onSave}
          >
            {saving ? "Salvataggioâ€¦" : "Salva journey"}
          </button>
        </div>
        {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
        {saveOk && <p className="mt-2 text-sm text-green-700">âœ” Creato! ID: {saveOk.id}</p>}
      </main>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, className, type = "text" }: { label?: string; value?: string; onChange?: (v: string) => void; placeholder?: string; className?: string; type?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <input
        type={type}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder, className }: { label?: string; value?: string; onChange?: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <textarea
        className="w-full min-h-[96px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

function Select({ label, value, onChange, options, className }: { label?: string; value?: string; onChange?: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <select
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProfileField({
  label,
  profileId,
  displayName,
  className,
}: {
  label: string;
  profileId?: string | null;
  displayName?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        {displayName || (profileId ? "Nome non disponibile" : "Non assegnato")}
      </div>
      {profileId && (
        <p className="text-[11px] text-neutral-500 mt-1">ID: {profileId}</p>
      )}
    </div>
  );
}
