
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { analyzeVideoDeep, saveJourney, type SaveJourneyPayload } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Scorecard } from "@/app/components/Scorecard";

type Visibility = "private" | "public";

const DEFAULT_LANGUAGE = "it";
type JourneyEvent = SaveJourneyPayload["events"][number];
type JourneyEventTranslation = JourneyEvent["translations"][number];

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

const EMPTY_GROUP_EVENT: SaveJourneyPayload["group_event"] = {
  title: "",
  cover_url: "",
  visibility: "private",
  status: "draft",
  pitch: "",
  description: "",
  language: DEFAULT_LANGUAGE,
};

const EMPTY_GROUP_EVENT_TRANSLATION = {
  lang: DEFAULT_LANGUAGE,
  title: "",
  short_name: "",
  description: "",
  video_url: "",
};

function createEmptyEvent(lang: string = DEFAULT_LANGUAGE): JourneyEvent {
  return {
    era: "AD",
    year_from: null,
    year_to: null,
    exact_date: null,
    continent: null,
    country: null,
    location: null,
    latitude: null,
    longitude: null,
    geom: null,
    source_event_id: null,
    image_url: null,
    images_json: null,
    translations: [
      {
        lang,
        title: "",
        description: "",
        description_short: "",
        wikipedia_url: "",
        video_url: "",
      },
    ],
    type_codes: [],
    media: [],
    added_by_user_ref: null,
  };
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

  const [ge, setGe] = useState(() => ({ ...EMPTY_GROUP_EVENT }));
  const [geT, setGeT] = useState(() => ({ ...EMPTY_GROUP_EVENT_TRANSLATION }));
  const [events, setEvents] = useState<JourneyEvent[]>(() => [createEmptyEvent(DEFAULT_LANGUAGE), createEmptyEvent(DEFAULT_LANGUAGE)]);
  const [videoUrl, setVideoUrl] = useState("");
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState<any | null>(null);
  const [coverAttachment, setCoverAttachment] = useState<{ public_url?: string | null; url?: string | null; preview_url?: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<{ id: string } | null>(null);

  const selectedJourney = useMemo(() => journeys.find((j) => j.id === selectedJourneyId) ?? null, [journeys, selectedJourneyId]);

  const resetEventState = useCallback((lang: string = DEFAULT_LANGUAGE) => {
    setEvents([createEmptyEvent(lang), createEmptyEvent(lang)]);
  }, []);

  const resetForm = useCallback(() => {
    setGe({ ...EMPTY_GROUP_EVENT });
    setGeT({ ...EMPTY_GROUP_EVENT_TRANSLATION });
    resetEventState();
    setVideoUrl("");
    setAnalyzed(null);
    setAnalyzeError(null);
    setJourneyDetailsError(null);
  }, [resetEventState]);

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

  const loadJourneyDetails = useCallback(async () => {
    if (!selectedJourneyId) {
      return;
    }
    setLoadingJourneyDetails(true);
    setJourneyDetailsError(null);
    try {
      const { data: base, error: baseError } = await supabase
        .from("group_events")
        .select("id,visibility,pitch")
        .eq("id", selectedJourneyId)
        .maybeSingle();
      if (baseError) throw baseError;
      if (!base) {
        throw new Error("Journey non trovato.");
      }

      const { data: translations, error: translationError } = await supabase
        .from("group_event_translations")
        .select("lang,title,short_name,description,video_url")
        .eq("group_event_id", selectedJourneyId)
        .order("lang")
        .limit(1);
      if (translationError) throw translationError;
      const tr = translations?.[0];
      const language = (tr?.lang || DEFAULT_LANGUAGE) as string;

      setGe({
        title: tr?.title || "",
        cover_url: "",
        visibility: (base.visibility || "private") as Visibility,
        status: "draft",
        pitch: base.pitch || "",
        description: tr?.description || "",
        language,
      });

      if (translations?.length) {
        setGeT({
          lang: tr.lang || language,
          title: tr.title || "",
          short_name: tr.short_name || "",
          description: tr.description || "",
          video_url: tr.video_url || "",
        });
      } else {
        setGeT({ ...EMPTY_GROUP_EVENT_TRANSLATION, lang: language });
      }

      try {
        const { data: attachments, error: attachmentsError } = await supabase
          .from("media_attachments")
          .select("media_id,media_assets(public_url,url,preview_url)")
          .eq("entity_type", "group_event")
          .eq("entity_id", selectedJourneyId)
          .eq("role", "cover")
          .order("position", { ascending: true })
          .limit(1);
        if (attachmentsError) throw attachmentsError;
        const row = attachments?.[0];
        const coverAsset = Array.isArray(row?.media_assets) ? row.media_assets[0] : row?.media_assets ?? null;
        if (coverAsset) {
          setCoverAttachment({ public_url: coverAsset.public_url, url: coverAsset.url, preview_url: coverAsset.preview_url });
          setGe((prev) => ({
            ...prev,
            cover_url: coverAsset.public_url || coverAsset.url || prev.cover_url,
          }));
        } else {
          setCoverAttachment(null);
        }
      } catch (coverErr: any) {
        console.debug("[BuildJourney] cover attachment not loaded:", coverErr?.message);
        setCoverAttachment(null);
      }

      const { data: groupLinks, error: linkError } = await supabase
        .from("event_group_event")
        .select("event_id")
        .eq("group_event_id", selectedJourneyId);
      if (linkError) throw linkError;
      const eventIds = groupLinks?.map((link) => link.event_id).filter(Boolean) ?? [];
      if (eventIds.length) {
        const { data: rawEvents, error: eventsError } = await supabase
          .from("events_list")
          .select("id,era,year_from,year_to,exact_date,continent,country,location,latitude,longitude")
          .in("id", eventIds);
        if (eventsError) throw eventsError;

        const { data: rawTranslations, error: translationsError } = await supabase
          .from("event_translations")
          .select("event_id,lang,title,description,description_short,wikipedia_url,video_url")
          .in("event_id", eventIds);
        if (translationsError) throw translationsError;

        const translationMap = new Map<string, JourneyEventTranslation>();
        rawTranslations?.forEach((tr) => {
          if (!tr?.event_id || translationMap.has(tr.event_id)) {
            return;
          }
          translationMap.set(tr.event_id, {
            lang: tr.lang || language,
            title: tr.title || "",
            description: tr.description || "",
            description_short: tr.description_short || "",
            wikipedia_url: tr.wikipedia_url || "",
            video_url: tr.video_url || "",
          });
        });

        const normalized = (rawEvents ?? []).map((ev) => ({
          era: ev.era || "AD",
          year_from: ev.year_from ?? null,
          year_to: ev.year_to ?? null,
          exact_date: ev.exact_date ?? null,
          continent: ev.continent ?? null,
          country: ev.country ?? null,
          location: ev.location ?? null,
          latitude: ev.latitude ?? null,
          longitude: ev.longitude ?? null,
          geom: null,
          source_event_id: null,
          image_url: null,
          images_json: null,
          translations: [
            translationMap.get(ev.id ?? "") ?? {
              lang: language,
              title: "",
              description: "",
              description_short: "",
              wikipedia_url: "",
              video_url: "",
            },
          ],
          type_codes: [],
          media: [],
          added_by_user_ref: null,
        }));
        if (normalized.length) {
          setEvents(normalized);
        } else {
          resetEventState(language);
        }
      } else {
        resetEventState(language);
      }
    } catch (err: any) {
      setJourneyDetailsError(err?.message || "Errore durante il caricamento dei dettagli.");
    } finally {
      setLoadingJourneyDetails(false);
    }
  }, [selectedJourneyId, supabase, resetEventState]);

  useEffect(() => {
    loadJourneys();
  }, [loadJourneys]);

  useEffect(() => {
    if (selectedJourneyId) {
      loadJourneyDetails();
    }
  }, [selectedJourneyId, loadJourneyDetails]);

  const patchEvent = (index: number, patch: Partial<JourneyEvent>) => {
    setEvents((prev) => prev.map((ev, idx) => (idx === index ? { ...ev, ...patch } : ev)));
  };

  const patchEventTranslation = (index: number, patch: Partial<JourneyEventTranslation>) => {
    setEvents((prev) =>
      prev.map((ev, idx) => {
        if (idx !== index) return ev;
        const current = ev.translations?.[0] ?? {
          lang: ge.language || DEFAULT_LANGUAGE,
          title: "",
          description: "",
          description_short: "",
          wikipedia_url: "",
          video_url: "",
        };
        return { ...ev, translations: [{ ...current, ...patch }] };
      })
    );
  };

  const addEvent = () => {
    setEvents((prev) => [...prev, createEmptyEvent(ge.language || DEFAULT_LANGUAGE)]);
  };

  const removeEvent = (index: number) => {
    setEvents((prev) => prev.filter((_, idx) => idx !== index));
  };

  const analyzeVideo = async () => {
    setAnalyzeError(null);
    const raw = videoUrl.trim();
    if (!raw) {
      setAnalyzeError("Inserisci un URL del video.");
      return;
    }
    let normalized = raw;
    if (!/^https?:\/\//i.test(normalized) && /(youtube\.com|youtu\.be|vimeo\.com)/i.test(normalized)) {
      normalized = "https://" + normalized;
      setVideoUrl(normalized);
    }

    const supported = /(youtu\.be|youtube\.com|vimeo\.com)/i.test(normalized);
    if (!supported) {
      setAnalyzeError("Sono supportati solo link YouTube o Vimeo.");
      return;
    }

    setAnalyzeLoading(true);
    try {
      const res = await analyzeVideoDeep({ videoUrl: normalized, lang: ge.language });
      setAnalyzed(res);
      setGe((prev) => ({
        ...prev,
        title: prev.title || res.prefill?.group_event?.title || "",
        cover_url: prev.cover_url || res.prefill?.group_event?.cover_url || "",
        description: prev.description || res.prefill?.group_event?.description || "",
      }));
      if (res.prefill?.events?.length) {
        setEvents(res.prefill.events as JourneyEvent[]);
      }
    } catch (err: any) {
      setAnalyzeError(err?.message || "Analyze failed.");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const loadAnalyzedEvents = () => {
    if (analyzed?.prefill?.events?.length) {
      setEvents(analyzed.prefill.events as JourneyEvent[]);
    }
  };

  const canSaveMetadata =
    ge.title.trim().length >= 3 &&
    /^https?:\/\//i.test(ge.cover_url || "") &&
    (ge.visibility === "private" || (ge.visibility === "public" && !!ge.status));

  const eventsValid =
    events.length >= 2 &&
    events.every((ev) => {
      const tr = ev.translations?.[0];
      return !!tr?.title?.trim() && !!tr?.description_short?.trim();
    });

  const canSaveJourney = canSaveMetadata && eventsValid;

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);

    if (!eventsValid) {
      setSaveError("Aggiungi almeno 2 eventi con Title e Short description.");
      setSaving(false);
      return;
    }
    if (!canSaveMetadata) {
      setSaveError("Compila il titolo e l'immagine di copertina del journey.");
      setSaving(false);
      return;
    }

    const payload: SaveJourneyPayload = {
      group_event: {
        title: ge.title,
        cover_url: ge.cover_url,
        visibility: ge.visibility,
        status: ge.status,
        pitch: ge.pitch || undefined,
        description: ge.description || undefined,
        language: ge.language || DEFAULT_LANGUAGE,
        owner_profile_id: profile?.id || undefined,
      },
      group_event_translation: geT.lang
        ? {
            lang: geT.lang,
            title: geT.title || undefined,
            short_name: geT.short_name || undefined,
            description: geT.description || undefined,
            video_url: geT.video_url || undefined,
          }
        : null,
      video_media_url: analyzed?.video?.url || null,
      events,
    };

    try {
      const res = await saveJourney(payload);
      setSaveOk({ id: res.group_event_id });
      setSelectedJourneyId(res.group_event_id);
      await loadJourneys();
    } catch (err: any) {
      setSaveError(err?.message || "Errore di salvataggio.");
    } finally {
      setSaving(false);
    }
  }


  const renderGroupEventsSection = () => {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">group_events</p>
            <h2 className="text-xl font-semibold text-neutral-900">Journey root</h2>
          </div>
          <div className="text-xs font-medium text-neutral-500">Includes translations + cover attachments</div>
        </div>
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <Input label="Journey name *" value={ge.title} onChange={(value) => setGe((prev) => ({ ...prev, title: value }))} placeholder="Es. Age of Exploration" />
              <div>
                <label className="block text-sm font-medium mb-1">Visibility *</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-sm ${ge.visibility === "private" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-300"}`}
                    onClick={() => setGe((prev) => ({ ...prev, visibility: "private" }))}
                  >
                    Private
                  </button>
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-sm ${ge.visibility === "public" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-300"}`}
                    onClick={() => setGe((prev) => ({ ...prev, visibility: "public" }))}
                  >
                    Public
                  </button>
                  {ge.visibility === "public" && (
                    <select
                      className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      value={ge.status}
                      onChange={(event) => setGe((prev) => ({ ...prev, status: event.target.value as "draft" | "published" }))}
                    >
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                    </select>
                  )}
                </div>
              </div>
              <Input label="Pitch" value={ge.pitch} onChange={(value) => setGe((prev) => ({ ...prev, pitch: value }))} placeholder="One-line hook" />
              <Textarea label="Description" value={ge.description} onChange={(value) => setGe((prev) => ({ ...prev, description: value }))} placeholder="Add a short description…" />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-700">Cover image *</p>
                <button type="button" className="text-xs font-semibold text-sky-600" onClick={() => setGe((prev) => ({ ...prev, cover_url: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200" }))}>
                  Use demo
                </button>
              </div>
              <Input
                value={ge.cover_url}
                onChange={(value) => {
                  setCoverAttachment(null);
                  setGe((prev) => ({ ...prev, cover_url: value }));
                }}
                placeholder="https://…"
              />
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-dashed border-neutral-300 flex items-center justify-center bg-neutral-100">
                {(() => {
                  const coverPreviewUrl = coverAttachment?.public_url || coverAttachment?.url || ge.cover_url;
                  return /^https?:\/\//i.test(coverPreviewUrl || "") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreviewUrl} className="h-full w-full object-cover" alt="cover preview" />
                  ) : (
                    <span className="text-neutral-400">Preview</span>
                  );
                })()}
              </div>
              {coverAttachment && (
                <p className="text-xs text-neutral-500">Copertina presa da media attachment</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-700">Translations (group_event_translations)</p>
              <span className="text-xs uppercase tracking-[0.2em] text-neutral-400">multi-language</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Select
                label="Lang"
                value={geT.lang}
                onChange={(value) => {
                  setGeT((prev) => ({ ...prev, lang: value }));
                  setGe((prev) => ({ ...prev, language: value }));
                }}
                options={[
                  { value: "it", label: "it" },
                  { value: "en", label: "en" },
                ]}
              />
              <Input label="Title" value={geT.title} onChange={(value) => setGeT((prev) => ({ ...prev, title: value }))} />
              <Input label="Short name" value={geT.short_name} onChange={(value) => setGeT((prev) => ({ ...prev, short_name: value }))} />
              <Input label="Video URL" value={geT.video_url} onChange={(value) => setGeT((prev) => ({ ...prev, video_url: value }))} />
              <Textarea className="md:col-span-2" label="Description" value={geT.description} onChange={(value) => setGeT((prev) => ({ ...prev, description: value }))} />
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderEventsSection = () => {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">events_list</p>
            <h2 className="text-xl font-semibold text-neutral-900">Events & related tables</h2>
          </div>
          <div className="text-xs font-medium text-neutral-500">Merges translations, types, attachments, correlations</div>
        </div>
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">events_list</p>
              <h3 className="text-lg font-semibold text-neutral-900">Eventi manuali</h3>
            </div>
            <div className="text-sm text-neutral-500">Events: {events.length}</div>
            <button type="button" className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold" onClick={addEvent}>
              + Add event
            </button>
          </div>
          <div className="space-y-4">
            {events.map((event, index) => (
              <EventCard
                key={index}
                index={index}
                event={event}
                onPatch={patchEvent}
                onPatchTranslation={patchEventTranslation}
                onRemove={removeEvent}
              />
            ))}
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="grid items-start gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Input label="Video URL" value={videoUrl} onChange={setVideoUrl} placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              <div className="flex gap-2 md:mt-0">
                <button
                  disabled={analyzeLoading || !videoUrl.trim()}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${videoUrl.trim() ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-500"}`}
                  onClick={analyzeVideo}
                >
                  {analyzeLoading ? "Analyzing…" : "Analyze video"}
                </button>
                <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700" onClick={() => setVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}>
                  Use demo
                </button>
              </div>
            </div>
            {analyzeError && <p className="mt-3 text-sm text-red-600">{analyzeError}</p>}
            {analyzed && (
              <div className="mt-4 space-y-3">
                <div className="text-sm">
                  <div className="font-medium">Title:</div>
                  <div className="text-neutral-700">{analyzed.video?.title}</div>
                </div>
                <div className="text-sm">
                  <div className="font-medium">Provider:</div>
                  <div className="text-neutral-700">{analyzed.provider}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {analyzed.prefill?.events?.map((item: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-neutral-200 p-3 text-left">
                      <div className="text-xs text-neutral-500">Event {idx + 1}</div>
                      <div className="text-sm font-medium">{item.translations?.[0]?.title}</div>
                      <div className="text-xs text-neutral-600 mt-1">
                        {item.exact_date || `${item.era ?? "AD"} ${item.year_from ?? ""}${item.year_to ? `–${item.year_to}` : ""}`} · {item.country || item.location || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                disabled={!analyzed?.prefill?.events?.length}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${analyzed?.prefill?.events?.length ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-500"}`}
                onClick={loadAnalyzedEvents}
              >
                Apply prefill
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  };


  const renderReferenceTablesSection = () => {
    const relatedTables = [
      "event_translations",
      "event_types",
      "event_type_map",
      "media_attachments",
      "event_group_event_correlated",
    ];
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Relazioni</p>
            <h2 className="text-xl font-semibold text-neutral-900">Tabelle correlate</h2>
          </div>
          <span className="text-xs text-neutral-500">Completa ogni tabella per un journey coerente</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {relatedTables.map((name) => (
            <div key={name} className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 p-4 text-sm text-neutral-600">
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">{name}</p>
              <p className="mt-2 text-sm font-semibold text-neutral-900">{name.replace(/_/g, " ")}</p>
              <p className="mt-1 text-[13px] text-neutral-500">Gestisci qui {name === "event_types" ? "i cataloghi dei tipi" : name === "event_group_event_correlated" ? "le correlazioni di approfondimento" : "i dati collegati"}.</p>
            </div>
          ))}
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
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {journeysLoading ? (
            <p className="text-sm text-neutral-500">Caricamento journeys…</p>
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
                  onCardClick={() => {
                    setSelectedJourneyId(journey.id);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-neutral-200 px-4 py-4 text-xs text-neutral-500">
          {checking
            ? "Verifico la sessione…"
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
        <div className="space-y-8">
          {renderGroupEventsSection()}
          {renderEventsSection()}
          {renderReferenceTablesSection()}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-neutral-500">
            {canSaveJourney ? "Tutti i dati sono pronti per essere salvati." : "Completa titolo, copertina e almeno 2 eventi con titolo e short descrizione."}
          </div>
          <button
            className={`rounded-2xl px-5 py-2 text-sm font-semibold ${canSaveJourney && !saving ? "bg-neutral-900 text-white" : "bg-neutral-300 text-neutral-500"}`}
            disabled={!canSaveJourney || saving}
            onClick={onSave}
          >
            {saving ? "Salvataggio…" : "Salva journey"}
          </button>
        </div>
        {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
        {saveOk && <p className="mt-2 text-sm text-green-700">✔ Creato! ID: {saveOk.id}</p>}
      </main>
    </div>
  );
}

type EventCardProps = {
  index: number;
  event: JourneyEvent;
  onPatch: (index: number, patch: Partial<JourneyEvent>) => void;
  onPatchTranslation: (index: number, patch: Partial<JourneyEventTranslation>) => void;
  onRemove: (index: number) => void;
};

function EventCard({ event, index, onPatch, onPatchTranslation, onRemove }: EventCardProps) {
  const translation = event.translations?.[0] ?? {
    lang: DEFAULT_LANGUAGE,
    title: "",
    description: "",
    description_short: "",
    wikipedia_url: "",
    video_url: "",
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="text-sm font-semibold text-neutral-700">Event {index + 1}</div>
        <button type="button" className="text-sm font-semibold text-red-600" onClick={() => onRemove(index)}>
          Remove
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Select
          label="Lang"
          value={translation.lang}
          onChange={(value) => onPatchTranslation(index, { lang: value })}
          options={[
            { value: "it", label: "it" },
            { value: "en", label: "en" },
          ]}
        />
        <Input label="Title *" value={translation.title} onChange={(value) => onPatchTranslation(index, { title: value })} />
        <Textarea label="Description" value={translation.description} onChange={(value) => onPatchTranslation(index, { description: value })} />
        <Input label="Short description *" value={translation.description_short} onChange={(value) => onPatchTranslation(index, { description_short: value })} />
        <Input label="Wikipedia URL" value={translation.wikipedia_url} onChange={(value) => onPatchTranslation(index, { wikipedia_url: value })} />
      </div>
      <details className="mt-4 rounded-lg border border-neutral-200 p-3">
        <summary className="text-sm font-medium cursor-pointer">Event details (date & place)</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Select
            label="Era"
            value={event.era || "AD"}
            onChange={(value) => onPatch(index, { era: value as "AD" | "BC" })}
            options={[
              { value: "AD", label: "AD" },
              { value: "BC", label: "BC" },
            ]}
          />
          <Input label="Year from" value={event.year_from?.toString() || ""} onChange={(value) => onPatch(index, { year_from: value ? Number(value) : null })} />
          <Input label="Year to" value={event.year_to?.toString() || ""} onChange={(value) => onPatch(index, { year_to: value ? Number(value) : null })} />
          <Input label="Exact date (YYYY-MM-DD)" value={event.exact_date || ""} onChange={(value) => onPatch(index, { exact_date: value || null })} />
          <Input label="Continent" value={event.continent || ""} onChange={(value) => onPatch(index, { continent: value || null })} />
          <Input label="Country" value={event.country || ""} onChange={(value) => onPatch(index, { country: value || null })} />
          <Input className="md:col-span-2" label="Location" value={event.location || ""} onChange={(value) => onPatch(index, { location: value || null })} />
          <Input label="Latitude" value={event.latitude?.toString() || ""} onChange={(value) => onPatch(index, { latitude: value ? Number(value) : null })} />
          <Input label="Longitude" value={event.longitude?.toString() || ""} onChange={(value) => onPatch(index, { longitude: value ? Number(value) : null })} />
        </div>
      </details>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, className }: { label?: string; value?: string; onChange?: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <input
        type="text"
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
