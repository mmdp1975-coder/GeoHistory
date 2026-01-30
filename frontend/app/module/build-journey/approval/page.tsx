
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  saveJourney,
  saveJourneyEvents,
  type SaveJourneyPayload,
  type GroupEventMediaEntry,
  type MediaKind,
  type JourneyEventEditPayload,
  deleteJourneyCascade,
  requestJourneyApproval,
  loadJourneyEvents,
} from "../actions";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Scorecard } from "@/app/components/Scorecard";
import { tUI } from "@/lib/i18n/uiLabels";

type Visibility = "private" | "public";

const DEFAULT_LANGUAGE = "it";
const DEFAULT_MAP_CENTER: [number, number] = [12.4964, 41.9028];
const inferContinentFromCoords = (lat?: number | null, lng?: number | null): string | null => {
  if (lat == null || lng == null) return null;
  if (lat < -60) return "Antarctica";
  if (lat >= -35 && lat <= 35 && lng >= -20 && lng <= 55) return "Africa";
  if (lat >= 35 && lng >= -30 && lng <= 60) return "Europe";
  if (lat >= -10 && lng > 60 && lng <= 180) return "Asia";
  if (lat >= -55 && lat < -10 && lng > 110 && lng <= 180) return "Oceania";
  if (lat >= -60 && lng >= -120 && lng <= -30) return "South America";
  if (lat >= 5 && lng < -30 && lng >= -180) return "North America";
  return null;
};

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
  description: string;
};

type ProfileNameRow = {
  id: string;
  full_name: string | null;
  username: string | null;
};

type MediaAttachmentRow = {
  id: string;
  media_id: string | null;
  role: string | null;
  title: string | null;
  caption: string | null;
  alt_text: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
  public_url: string | null;
  source_url: string | null;
  media_type: string | null;
};

type GroupEventMediaItem = GroupEventMediaEntry & {
  id?: string;
  media_id?: string;
  tempId: string;
  kind: MediaKind;
};

const MEDIA_KIND_OPTIONS: { value: MediaKind; label: string }[] = [
  { value: "image", label: "Immagine" },
  { value: "video", label: "Video" },
  { value: "other", label: "Altro" },
];

type JourneyStatus = "draft" | "submitted" | "published" | "refused";

type JourneyFilterValue = "all" | Visibility | "pending";
type JourneyStatusFilterValue = "all" | JourneyStatus;

type JourneySortValue = "approved_desc" | "approved_asc";

type JourneyRating = {
  avg_rating: number | null;
  ratings_count: number | null;
};

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return hash;
};

const buildAutoSlug = (title?: string | null, description?: string | null) => {
  const baseSource = title?.trim() || description?.trim() || "journey";
  const baseSlug = slugifyTitle(baseSource).slice(0, 60);
  const hashSource = `${title || ""}|${description || ""}`;
  const hash = Math.abs(hashString(hashSource)).toString(36).slice(0, 4);
  const uniquePart = hash ? `-${hash}` : "";
  const slug = `${baseSlug || "journey"}${uniquePart}`;
  return slug.replace(/-+$/, "");
};

const buildAutoCode = (title?: string | null, description?: string | null) => {
  const base = slugifyTitle(title) || "journey";
  const hashSource = `${title || ""}|${description || ""}`;
  const hash = Math.abs(hashString(hashSource)).toString(36).toUpperCase().slice(0, 4) || "AUTO";
  return `${base.slice(0, 8).toUpperCase()}-${hash}`;
};

type JourneyEventSummary = {
  event_id: string;
  title: string;
  description_short?: string;
  exact_date?: string | null;
  year_from?: number | null;
  year_to?: number | null;
  country?: string | null;
  location?: string | null;
  role?: string | null;
};

type JourneyEventEditor = {
  tempId: string;
  event_id?: string;
  added_by_user_ref?: string | null;
  activeLang: string;
  event: {
    era: "AD" | "BC" | null;
    created_at: string | null;
    year_from: number | null;
    year_to: number | null;
    exact_date: string | null;
    continent: string | null;
    country: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    geom: string | null;
    source_event_id: string | null;
    image_url: string | null;
    images_json: any | null;
    event_types_id?: string | null;
  };
  translation: {
    id?: string;
    lang: string;
    title: string;
    description_short: string;
    description: string;
    wikipedia_url: string;
    video_url: string;
  };
  translations_all: {
    id?: string;
    lang: string;
    title: string;
    description_short: string;
    description: string;
    wikipedia_url: string;
    video_url: string;
  }[];
  type_codes: string[];
  media: GroupEventMediaItem[];
  correlations: { group_event_id: string; correlation_type?: string | null }[];
};

type EventTab = "details" | "translations" | "relations" | "media";

const normalizeMediaKind = (value?: string | null): MediaKind => {
  if (!value) {
    return "image";
  }
  const normalized = value.toLowerCase();
  return MEDIA_KIND_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as MediaKind)
    : "image";
};

const buildTempMediaId = () => `tmp-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

const createEmptyGroupEventMediaItem = (): GroupEventMediaItem => ({
  tempId: buildTempMediaId(),
  kind: "image",
  role: "gallery",
  public_url: "",
  source_url: "",
  title: "",
  caption: "",
  alt_text: "",
  is_primary: false,
  sort_order: undefined,
});

const createEmptyEventTranslation = (lang: string, id?: string) => ({
  id,
  lang,
  title: "",
  description_short: "",
  description: "",
  wikipedia_url: "",
  video_url: "",
});

const createEmptyEventEditor = (): JourneyEventEditor => ({
  tempId: buildTempMediaId(),
  event_id: undefined,
  added_by_user_ref: null,
  activeLang: DEFAULT_LANGUAGE,
  event: {
    era: "AD",
    created_at: null,
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
  },
  translation: createEmptyEventTranslation(DEFAULT_LANGUAGE),
  translations_all: [createEmptyEventTranslation(DEFAULT_LANGUAGE)],
  type_codes: [],
  media: [],
  correlations: [],
});

const EMPTY_GROUP_EVENT: SaveJourneyPayload["group_event"] = {
  cover_url: "",
  visibility: "private",
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
  description: "",
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

const slugifyTitle = (title?: string | null): string => {
  if (!title) return "";
  return title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
};

const normalizeYearForEra = (year?: number | null, era?: "AD" | "BC" | null): number | null => {
  if (year == null) return null;
  if (era === "BC") return year > 0 ? -year : year;
  return year;
};

const formatYearWithEra = (year?: number | null, era?: "AD" | "BC" | null): string | null => {
  if (year == null) return null;
  return era === "BC" ? `${year} BC` : `${year}`;
};


export default function BuildJourneyPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, checking, error: profileError } = useCurrentUser();

  const [langCode, setLangCode] = useState<string>("en");

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
  const [groupEventMedia, setGroupEventMedia] = useState<GroupEventMediaItem[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [journeyVisibilityMap, setJourneyVisibilityMap] = useState<Record<string, Visibility>>({});
  const [journeyApprovalPendingMap, setJourneyApprovalPendingMap] = useState<Record<string, boolean>>({});
  const [journeyStatusMap, setJourneyStatusMap] = useState<Record<string, JourneyStatus>>({});
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilterValue>("all");
  const [journeyStatusFilter, setJourneyStatusFilter] = useState<JourneyStatusFilterValue>("all");
  const [journeySort, setJourneySort] = useState<JourneySortValue>("approved_asc");
  const [journeyRatingMap, setJourneyRatingMap] = useState<Record<string, JourneyRating>>({});
  const [activeTab, setActiveTab] = useState<"group" | "events">("group");
  const [journeySubTab, setJourneySubTab] = useState<"general" | "translations" | "media">("general");
  const [availableEventTypes, setAvailableEventTypes] = useState<{ id: string; label: string }[]>([]);
  const [journeyEvents, setJourneyEvents] = useState<JourneyEventEditor[]>([]);
  const [selectedEventTempId, setSelectedEventTempId] = useState<string | null>(null);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [eventsSaveError, setEventsSaveError] = useState<string | null>(null);
  const [eventsSaveOk, setEventsSaveOk] = useState<string | null>(null);
  const [relatedEvents, setRelatedEvents] = useState<JourneyEventSummary[]>([]);
  const [relatedEventsLoading, setRelatedEventsLoading] = useState(false);
  const [relatedEventsError, setRelatedEventsError] = useState<string | null>(null);
  const [eventTabMap, setEventTabMap] = useState<Record<string, EventTab>>({});
  const [mediaFilterKind, setMediaFilterKind] = useState<MediaKind | "all">("all");
  const [mapOverlayEventId, setMapOverlayEventId] = useState<string | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteOk, setDeleteOk] = useState<string | null>(null);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalOk, setApprovalOk] = useState<string | null>(null);
  const [moderationSaving, setModerationSaving] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [moderationOk, setModerationOk] = useState<string | null>(null);
  const lastAutoSlugRef = useRef<string>("");
  const lastAutoCodeRef = useRef<string>("");
  const correlationJourneyOptions = useMemo(() => {
    const formatLabel = (journey: JourneySummary) => {
      const title = journey.title?.trim() || tUI(langCode, "journey.title_fallback");
      const years =
        journey.yearFrom != null || journey.yearTo != null
          ? `${journey.yearFrom ?? "?"}-${journey.yearTo ?? "?"}`
          : null;
      return years ? `${title} (${years})` : title;
    };
    const baseOptions = journeys.map((journey) => ({
      value: journey.id,
      label: formatLabel(journey),
    }));
    const known = new Set(baseOptions.map((opt) => opt.value));
    const orphanIds = new Set<string>();
    journeyEvents.forEach((ev) =>
      ev.correlations.forEach((corr) => {
        if (corr.group_event_id && !known.has(corr.group_event_id)) {
          orphanIds.add(corr.group_event_id);
        }
      }),
    );
    const fallbackOptions = Array.from(orphanIds).map((id) => ({
      value: id,
      label: `${id} ${tUI(langCode, "build.events.not_listed")}`,
    }));
    return [{ value: "", label: tUI(langCode, "build.events.related_journey") }, ...baseOptions, ...fallbackOptions];
  }, [journeys, journeyEvents, langCode]);

  const mediaKindOptions = useMemo(
    () => [
      { value: "image" as MediaKind, label: tUI(langCode, "build.media.kind.image") },
      { value: "video" as MediaKind, label: tUI(langCode, "build.media.kind.video") },
      { value: "other" as MediaKind, label: tUI(langCode, "build.media.kind.other") },
    ],
    [langCode],
  );

  const journeyFilterOptions = useMemo(
    () => [
      { value: "all" as JourneyFilterValue, label: tUI(langCode, "build.sidebar.filter.all") },
      { value: "public" as JourneyFilterValue, label: tUI(langCode, "build.sidebar.filter.public") },
      { value: "private" as JourneyFilterValue, label: tUI(langCode, "build.sidebar.filter.private") },
      {
        value: "pending" as JourneyFilterValue,
        label: (() => {
          const lbl = tUI(langCode, "build.sidebar.filter.pending");
          return lbl === "build.sidebar.filter.pending" ? "pending" : lbl;
        })(),
      },
    ],
    [langCode],
  );

  const journeyStatusOptions = useMemo(
    () => [
      { value: "all" as JourneyStatusFilterValue, label: tUI(langCode, "build.sidebar.status.all") },
      { value: "draft" as JourneyStatusFilterValue, label: tUI(langCode, "build.sidebar.status.draft") },
      { value: "submitted" as JourneyStatusFilterValue, label: tUI(langCode, "build.sidebar.status.submitted") },
      { value: "published" as JourneyStatusFilterValue, label: tUI(langCode, "build.sidebar.status.published") },
      { value: "refused" as JourneyStatusFilterValue, label: tUI(langCode, "build.sidebar.status.refused") },
    ],
    [langCode],
  );

  const journeySortOptions = useMemo(
    () => [
      { value: "approved_desc" as JourneySortValue, label: tUI(langCode, "build.sidebar.sort.last") },
      { value: "approved_asc" as JourneySortValue, label: tUI(langCode, "build.sidebar.sort.first") },
    ],
    [langCode],
  );

  const languageOptions = useMemo(
    () => [
      { value: "it", label: "Italiano" },
      { value: "en", label: "English" },
    ],
    [],
  );

  useEffect(() => {
    let active = true;
    const browserLang = typeof window !== "undefined" ? window.navigator.language : "en";
    (async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) {
          console.warn("[BuildJourney] auth.getUser error:", userError.message);
        }
        if (!user) {
          if (active) setLangCode(browserLang);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("language_code")
          .eq("id", user.id)
          .maybeSingle();
        if (error) {
          console.warn("[BuildJourney] profiles.language_code error:", error.message);
          if (active) setLangCode(browserLang);
          return;
        }
        if (active) {
          const lang = (data?.language_code as string | null) ?? null;
          setLangCode(lang?.trim() || browserLang);
        }
      } catch (err: any) {
        if (active) setLangCode(browserLang);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const selectedJourney = useMemo(() => journeys.find((j) => j.id === selectedJourneyId) ?? null, [journeys, selectedJourneyId]);
  const filteredJourneys = useMemo(() => {
    if (journeyFilter === "all") {
      const byStatus =
        journeyStatusFilter === "all"
          ? journeys
          : journeys.filter((journey) => journeyStatusMap[journey.id] === journeyStatusFilter);
      return byStatus;
    }
    if (journeyFilter === "pending") {
      const base = journeys.filter((journey) => journeyApprovalPendingMap[journey.id]);
      if (journeyStatusFilter === "all") return base;
      return base.filter((journey) => journeyStatusMap[journey.id] === journeyStatusFilter);
    }
    const byVisibility = journeys.filter((journey) => journeyVisibilityMap[journey.id] === journeyFilter);
    if (journeyStatusFilter === "all") return byVisibility;
    return byVisibility.filter((journey) => journeyStatusMap[journey.id] === journeyStatusFilter);
  }, [journeyFilter, journeyStatusFilter, journeyVisibilityMap, journeyStatusMap, journeyApprovalPendingMap, journeys]);
  const sortedEvents = useMemo(() => {
    const toSortValue = (ev: JourneyEventEditor): number => {
      const yearFrom = normalizeYearForEra(ev.event.year_from, ev.event.era);
      if (yearFrom != null) return yearFrom;
      if (ev.event.exact_date) {
        const parsed = new Date(ev.event.exact_date);
        if (!isNaN(parsed.getTime())) return parsed.getTime();
      }
      const yearTo = normalizeYearForEra(ev.event.year_to, ev.event.era);
      if (yearTo != null) return yearTo;
      return Number.POSITIVE_INFINITY;
    };
    return [...journeyEvents]
      .map((ev, idx) => ({ ev, idx }))
      .sort((a, b) => {
        const diff = toSortValue(a.ev) - toSortValue(b.ev);
        if (isFinite(diff) && diff !== 0) return diff;
        return a.idx - b.idx;
      })
      .map((entry) => entry.ev);
  }, [journeyEvents]);
  const selectedEvent = useMemo(
    () => journeyEvents.find((ev) => ev.tempId === selectedEventTempId) ?? null,
    [journeyEvents, selectedEventTempId],
  );
  const toolbarSelectedEventTab = selectedEventTempId ? eventTabMap[selectedEventTempId] ?? "details" : "details";

  const buildEventsPayload = useCallback(
    (group_event_id: string): { events: JourneyEventEditPayload[]; delete_event_ids: string[] } => {
      const events = journeyEvents.map((ev) => {
        const typeCodes =
          ev.type_codes && ev.type_codes.length
            ? ev.type_codes
            : ev.event.event_types_id
            ? [ev.event.event_types_id]
            : [];
        return {
          event_id: ev.event_id,
          added_by_user_ref: ev.added_by_user_ref ?? null,
          event: { ...ev.event },
          translation: { ...ev.translation },
          translations: ev.translations_all,
          type_codes: typeCodes.map((code) => code?.trim()).filter(Boolean),
          correlations: ev.correlations
            .map((c) => ({
              group_event_id: c.group_event_id?.trim() || "",
              correlation_type: c.correlation_type || "related",
            }))
            .filter((c) => c.group_event_id),
          media: ev.media
            .map((m, mIdx) => ({
              public_url: m.public_url?.trim() || undefined,
              source_url: m.source_url?.trim() || undefined,
              title: m.title?.trim() || undefined,
              caption: m.caption?.trim() || undefined,
              alt_text: m.alt_text?.trim() || undefined,
              role: m.role ?? "gallery",
              sort_order: m.sort_order ?? mIdx,
              is_primary: m.is_primary,
              kind: m.kind,
            }))
            .filter((m) => m.public_url || m.source_url),
        };
      });
      return { events, delete_event_ids: deletedEventIds };
    },
    [deletedEventIds, journeyEvents],
  );

  const resetForm = useCallback(() => {
    setGe({ ...EMPTY_GROUP_EVENT, owner_profile_id: profile?.id || "" });
    setJourneyDetailsError(null);
    setTranslation({ ...EMPTY_GROUP_EVENT_TRANSLATION, lang: DEFAULT_LANGUAGE });
    setSelectedTranslationLang(DEFAULT_LANGUAGE);
    setTranslations([]);
    setGroupEventMedia([]);
    setRelatedEvents([]);
    setRelatedEventsError(null);
    setRelatedEventsLoading(false);
    setJourneyEvents([]);
    setEventTabMap({});
    setDeletedEventIds([]);
    setEventsSaveError(null);
    setEventsSaveOk(null);
    setSelectedEventTempId(null);
    setDeleteError(null);
    setDeleteOk(null);
    setApprovalError(null);
    setApprovalOk(null);
  }, [profile?.id]);

  // Auto-popola slug e code in base a titolo e descrizione, mantenendo la possibilità di override manuale.
  useEffect(() => {
    const autoSlug = buildAutoSlug(translation.title, ge.description);
    const autoCode = buildAutoCode(translation.title, ge.description);

    setGe((prev) => {
      let next = prev;

      if (autoSlug && (!prev.slug || prev.slug === lastAutoSlugRef.current)) {
        next = next === prev ? { ...next, slug: autoSlug } : { ...next, slug: autoSlug };
        lastAutoSlugRef.current = autoSlug;
      }

      const codeCandidate = autoCode || prev.code;
      if (codeCandidate && (!prev.code || prev.code === lastAutoCodeRef.current)) {
        next = next === prev ? { ...next, code: codeCandidate } : { ...next, code: codeCandidate };
        lastAutoCodeRef.current = codeCandidate;
      }

      return next;
    });
  }, [translation.title, ge.description]);

  const handleNewJourney = () => {
    setSelectedJourneyId(null);
    resetForm();
    setSaveError(null);
    setSaveOk(null);
  };

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lng}`);
    if (!res.ok) {
      throw new Error("reverse geocode failed");
    }
    const data = await res.json();
    return {
      continent: (data?.continent as string) || null,
      country: (data?.country as string) || null,
      place: (data?.place as string) || null,
    };
  }, []);

  const handleMapSelection = useCallback(
    (tempId: string, lat: number, lng: number) => {
      const continentGuess = inferContinentFromCoords(lat, lng);
      const hint = `Lat ${lat.toFixed(3)}, Lon ${lng.toFixed(3)}`;

      setJourneyEvents((prev) =>
        prev.map((item) => {
          if (item.tempId !== tempId) return item;
          return {
            ...item,
            event: {
              ...item.event,
              latitude: lat,
              longitude: lng,
              continent: continentGuess ?? item.event.continent ?? hint,
            },
          };
        }),
      );
          setGeocodeLoading((prev) => ({ ...prev, [tempId]: true }));
          reverseGeocode(lat, lng)
            .then((geo) => {
              setJourneyEvents((prev) =>
                prev.map((item) => {
                  if (item.tempId !== tempId) return item;
                  return {
                    ...item,
                    event: {
                      ...item.event,
                      continent: geo.continent ?? item.event.continent,
                      country: geo.country ?? item.event.country ?? "",
                      location: geo.place ?? item.event.location ?? "",
                    },
                  };
                }),
              );
            })
            .catch(() => {
          // ignore geocode failures, keep manual edit
        })
        .finally(() =>
          setGeocodeLoading((prev) => {
            const next = { ...prev };
            delete next[tempId];
            return next;
          }),
        );
    },
    [reverseGeocode],
  );

  const loadEventTypes = useCallback(async () => {
    try {
      const { data: typeRows } = await supabase.from("event_types").select("id");
      if (typeRows) {
        const codes = Array.from(
          new Map(
            typeRows
              .map((row: any) => {
                const id = row?.id ? String(row.id).trim() : "";
                const label = id;
                return id ? [id, label] : null;
              })
              .filter((entry): entry is [string, string] => Boolean(entry)),
          ).entries(),
        ).map(([id, label]) => ({ id, label }));
        setAvailableEventTypes(codes);
      }
    } catch {
      // ignore errors
    }
  }, [supabase]);

  const loadJourneys = useCallback(async () => {
    if (!profile?.id) {
      return;
    }
    setJourneysLoading(true);
    setJourneysError(null);
    setJourneyVisibilityMap({});
    setJourneyApprovalPendingMap({});
    setJourneyStatusMap({});
    setJourneyRatingMap({});
    try {
      const { data: owned, error: ownedError } = await supabase
        .from("group_events")
        .select("id")
        .eq("owner_profile_id", profile.id);
      if (ownedError) throw ownedError;
      const ownerIds = (owned ?? []).map((row) => row.id).filter(Boolean);
      if (!ownerIds.length) {
        setJourneys([]);
        setJourneyVisibilityMap({});
        setJourneyApprovalPendingMap({});
        setJourneyStatusMap({});
        return;
      }
      const { data: rows, error } = await supabase
        .from("v_journeys")
        .select("journey_id,journey_cover_url,translation_title,approved_at,events_count,year_from_min,year_to_max")
        .in("journey_id", ownerIds)
        .order("approved_at", { ascending: journeySort === "approved_asc" });
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
      const journeyIds = journeysFromView.map((journey) => journey.journey_id);
      const { data: visibilityRows, error: visibilityError } = await supabase
        .from("group_events")
        .select("id,visibility,workflow_state,requested_approval_at,approved_at,refused_at")
        .in("id", ownerIds);
      if (visibilityError) throw visibilityError;
      const visibilityMap: Record<string, Visibility> = {};
      const pendingMap: Record<string, boolean> = {};
      const statusMap: Record<string, JourneyStatus> = {};
      (visibilityRows ?? []).forEach((row) => {
        if (row.id && (row.visibility === "private" || row.visibility === "public")) {
          visibilityMap[row.id] = row.visibility as Visibility;
        }
        const requested = (row as any).requested_approval_at;
        const approved = (row as any).approved_at;
        const refused = (row as any).refused_at;
        if (row.id) {
          pendingMap[row.id] = !!requested && !approved && !refused;
          const st = (row as any).workflow_state as string | null;
          const normalized = st && typeof st === "string" ? st.toLowerCase() : null;
          const allowed: JourneyStatus[] = ["draft", "submitted", "published", "refused"];
          statusMap[row.id] = allowed.includes(normalized as JourneyStatus)
            ? (normalized as JourneyStatus)
            : "draft";
        }
      });
      setJourneyVisibilityMap(visibilityMap);
      setJourneyApprovalPendingMap(pendingMap);
      setJourneyStatusMap(statusMap);

      const ratingMap: Record<string, JourneyRating> = {};
      if (journeyIds.length) {
        const { data: stats, error: statsError } = await supabase
          .from("v_group_event_rating_stats")
          .select("group_event_id,avg_rating,ratings_count")
          .in("group_event_id", journeyIds);
        if (statsError) throw statsError;
        (stats ?? []).forEach((row) => {
          const record = row as Record<string, unknown>;
          if (typeof record.group_event_id === "string") {
            ratingMap[record.group_event_id] = {
              avg_rating: typeof record.avg_rating === "number" ? record.avg_rating : null,
              ratings_count: typeof record.ratings_count === "number" ? record.ratings_count : null,
            };
          }
        });
      }
      setJourneyRatingMap(ratingMap);
    } catch (err: any) {
      setJourneysError(err?.message || tUI(langCode, "build.messages.list_error"));
    } finally {
      setJourneysLoading(false);
    }
  }, [profile?.id, supabase, journeySort, langCode]);

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
        throw new Error(tUI(langCode, "build.messages.not_found"));
      }
      const language = (base.language as string) || DEFAULT_LANGUAGE;
      setGe((prev) => ({
        ...prev,
        cover_url: base.cover_url || "",
        visibility: (base.visibility || "private") as Visibility,
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
        .select("lang,title,description")
        .eq("group_event_id", journeyId);
      if (translationsError) throw translationsError;
      const normalized = (translationsData ?? [])
        .map((row) => ({
          lang: (row.lang || "").trim(),
          title: row.title || "",
          description: row.description || "",
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
          description: mainTranslation.description || "",
        });
      } else {
        setSelectedTranslationLang(DEFAULT_LANGUAGE);
        setTranslation({ ...EMPTY_GROUP_EVENT_TRANSLATION, lang: DEFAULT_LANGUAGE });
      }
      setNewTranslationLang("");
      setDeletedTranslationLangs([]);

      const { data: mediaData, error: mediaError } = await supabase
        .from("v_media_attachments_expanded")
        .select(
          "id,media_id,entity_type,role,title,caption,alt_text,is_primary,sort_order,public_url,source_url,media_type",
        )
        .eq("group_event_id", journeyId)
        .eq("entity_type", "group_event")
        .order("sort_order", { ascending: true });
      if (mediaError) throw mediaError;
      const normalizedMedia =
        ((mediaData ?? []) as MediaAttachmentRow[]).map((row) => ({
          id: row.id,
          media_id: row.media_id ?? undefined,
          role: (row.role as any) ?? "gallery",
          kind: normalizeMediaKind(row.media_type),
          public_url: row.public_url ?? "",
          source_url: row.source_url ?? "",
          title: row.title ?? "",
          caption: row.caption ?? "",
          alt_text: row.alt_text ?? "",
          sort_order: row.sort_order ?? undefined,
          is_primary: !!row.is_primary,
          tempId: row.id,
        })) ?? [];
      setGroupEventMedia(normalizedMedia);

      setRelatedEventsLoading(true);
      setRelatedEventsError(null);
      try {
        const {
          rows: evRows,
          translations: trRows,
          correlations: corrRows,
          media: mediaRows,
        } = await loadJourneyEvents({ group_event_id: journeyId });
        const rows = (evRows ?? []) as any[];

        const translationsMap: Record<string, { primary: JourneyEventEditor["translation"]; all: JourneyEventEditor["translations_all"] }> = {};
        (trRows ?? []).forEach((row: any) => {
          if (!row?.event_id) return;
          const trObj = {
            id: row.id as string | undefined,
            lang: row.lang || DEFAULT_LANGUAGE,
            title: row.title || "",
            description_short: row.description_short || "",
            description: row.description || "",
            wikipedia_url: row.wikipedia_url || "",
            video_url: row.video_url || "",
          };
          const existing = translationsMap[row.event_id];
          if (!existing) {
            translationsMap[row.event_id] = { primary: trObj, all: [trObj] };
          } else {
            existing.all.push(trObj);
            // prefer the default language as "primary"
            if (trObj.lang === DEFAULT_LANGUAGE) {
              existing.primary = trObj;
            }
          }
        });

        const corrMap: Record<string, { group_event_id: string; correlation_type?: string | null }[]> = {};
        (corrRows ?? []).forEach((row: any) => {
          if (!row?.event_id || !row?.group_event_id) return;
          corrMap[row.event_id] = corrMap[row.event_id] || [];
          corrMap[row.event_id].push({
            group_event_id: row.group_event_id,
            correlation_type: row.correlation_type ?? "related",
          });
        });

        const mediaMap: Record<string, GroupEventMediaItem[]> = {};
        (mediaRows ?? []).forEach((row: any) => {
          if (!row?.event_id) return;
          mediaMap[row.event_id] = mediaMap[row.event_id] || [];
          mediaMap[row.event_id].push({
            id: row.id,
            media_id: row.media_id ?? undefined,
            role: row.role ?? "gallery",
            kind: normalizeMediaKind(row.media_type),
            public_url: row.public_url ?? "",
            source_url: row.source_url ?? "",
            title: row.title ?? "",
            caption: row.caption ?? "",
            alt_text: row.alt_text ?? "",
            sort_order: row.sort_order ?? undefined,
            is_primary: !!row.is_primary,
            tempId: row.id,
          });
        });

        const typeOptionsFromEvents: { id: string; label: string }[] = [];
        const mapped: JourneyEventEditor[] = rows.map((row) => {
          const ev = row.events_list || {};
          const joinedTypeRaw = ev.event_types;
          const joinedType = Array.isArray(joinedTypeRaw) ? joinedTypeRaw[0] : joinedTypeRaw;
          const eventId = row.event_id || ev.id;
          const tr = translationsMap[eventId]?.primary || {
            ...createEmptyEventTranslation(DEFAULT_LANGUAGE),
          };
          const trAll = translationsMap[eventId]?.all || [createEmptyEventTranslation(DEFAULT_LANGUAGE)];
          const media = mediaMap[eventId] || [];
          const rawTypes = joinedType?.id ?? ev.event_types_id;
          const type_codes = Array.isArray(rawTypes)
            ? rawTypes.map((t: any) => String(t).trim()).filter(Boolean)
            : rawTypes
            ? [String(rawTypes).trim()]
            : [];
          if (joinedType?.id) {
            const id = String(joinedType.id).trim();
            if (id) {
              typeOptionsFromEvents.push({ id, label: id });
            }
          }
          return {
            tempId: eventId || buildTempMediaId(),
            event_id: eventId,
            added_by_user_ref: row.added_by_user_ref ?? null,
            activeLang: tr.lang || DEFAULT_LANGUAGE,
            event: {
              era: (ev.era as "AD" | "BC") || "AD",
              created_at: ev.created_at ?? null,
              year_from: ev.year_from ?? null,
              year_to: ev.year_to ?? null,
              exact_date: ev.exact_date ?? null,
              continent: ev.continent ?? null,
              country: ev.country ?? null,
              location: ev.location ?? null,
              latitude: ev.latitude ?? null,
              longitude: ev.longitude ?? null,
              geom: ev.geom ?? null,
              source_event_id: ev.source_event_id ?? null,
              image_url: ev.image_url ?? null,
              images_json: ev.images ?? null,
              event_types_id: rawTypes ?? null,
            },
            translation: tr,
            translations_all: trAll,
            type_codes,
            media,
            correlations: corrMap[eventId] ?? [],
          };
        });
        setJourneyEvents(mapped);
        // ensure available type list includes any from the fetched events
        setAvailableEventTypes((prev) => {
          const next = new Map(prev.map((t) => [t.id, t.label]));
          typeOptionsFromEvents.forEach((opt) => {
            if (!next.has(opt.id)) {
              next.set(opt.id, opt.label);
            }
          });
          mapped.forEach((ev) =>
            ev.type_codes.forEach((t) => {
              if (!next.has(t)) {
                next.set(t, t);
              }
            }),
          );
          return Array.from(next.entries()).map(([id, label]) => ({ id, label }));
        });
        setEventTabMap((prev) => {
          const next = { ...prev };
          mapped.forEach((ev) => {
            if (!next[ev.tempId]) {
              next[ev.tempId] = "details";
            }
          });
          return next;
        });
        setRelatedEvents(
          mapped.map((ev) => ({
            event_id: ev.event_id || ev.tempId,
            title: ev.translation.title || tUI(langCode, "build.events.new"),
            description_short: ev.translation.description_short,
            exact_date: ev.event.exact_date,
            year_from: ev.event.year_from,
            year_to: ev.event.year_to,
            country: ev.event.country,
            location: ev.event.location,
          })),
        );
      } catch (evErr: any) {
        setRelatedEventsError(evErr?.message || tUI(langCode, "build.messages.related_events_error"));
      } finally {
        setRelatedEventsLoading(false);
      }

    } catch (err: any) {
      setJourneyDetailsError(err?.message || tUI(langCode, "build.messages.details_error"));
    } finally {
      setLoadingJourneyDetails(false);
    }
  }, [supabase, profile?.id, setGroupEventMedia, langCode]);

  useEffect(() => {
    loadJourneys();
  }, [loadJourneys]);

  useEffect(() => {
    if (!availableEventTypes.length) {
      void loadEventTypes();
    }
  }, [availableEventTypes.length, loadEventTypes]);

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
        description: tr.description || "",
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

  const addMediaItem = useCallback(() => {
    setGroupEventMedia((prev) => [...prev, createEmptyGroupEventMediaItem()]);
  }, []);

  const removeMediaItem = useCallback((index: number) => {
    setGroupEventMedia((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const updateMediaItemField = useCallback(
    <K extends keyof GroupEventMediaItem>(index: number, field: K, value: GroupEventMediaItem[K]) => {
      setGroupEventMedia((prev) =>
        prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)),
      );
    },
    [],
  );

  const formatEventDateLabel = useCallback((ev: JourneyEventEditor) => {
    if (ev.event.exact_date) return ev.event.exact_date;
    const yearFrom = formatYearWithEra(ev.event.year_from, ev.event.era);
    const yearTo = formatYearWithEra(ev.event.year_to, ev.event.era);
    if (yearFrom && yearTo) return `${yearFrom}-${yearTo}`;
    if (yearFrom) return yearFrom;
    if (yearTo) return yearTo;
    return "Data n/d";
  }, []);

  const handleRemoveEvent = useCallback(
    (target: JourneyEventEditor) => {
      let nextSelectedId: string | null = null;
      setJourneyEvents((prev) => {
        const next = prev.filter((item) => item.tempId !== target.tempId);
        nextSelectedId = next[0]?.tempId ?? null;
        return next;
      });
      setEventTabMap((prev) => {
        const next = { ...prev };
        delete next[target.tempId];
        return next;
      });
      const eventId = target.event_id;
      if (eventId) {
        setDeletedEventIds((prev) => (prev.includes(eventId) ? prev : [...prev, eventId]));
      }
      setSelectedEventTempId((prev) => {
        if (prev && prev !== target.tempId) return prev;
        return nextSelectedId;
      });
    },
    [setJourneyEvents, setEventTabMap, setDeletedEventIds, setSelectedEventTempId],
  );

  const selectJourney = useCallback((journeyId: string) => {
    setSelectedJourneyId(journeyId);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
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
    if (!journeyEvents.length) {
      if (selectedEventTempId !== null) {
        setSelectedEventTempId(null);
      }
      return;
    }
    if (!selectedEventTempId || !journeyEvents.some((ev) => ev.tempId === selectedEventTempId)) {
      setSelectedEventTempId(sortedEvents[0]?.tempId ?? journeyEvents[0].tempId);
    }
  }, [journeyEvents, sortedEvents, selectedEventTempId]);

  const canSaveMetadata =
    (ge.slug ?? "").trim().length > 0 && (ge.code ?? "").trim().length > 0;

  const canSaveJourney = canSaveMetadata;

  async function onSave() {
    setSaveError(null);
    setSaveOk(null);
    setEventsSaveError(null);
    setEventsSaveOk(null);

    if (!canSaveMetadata) {
      setSaveError(tUI(langCode, "build.messages.metadata_required"));
      return;
    }

    if (!selectedJourneyId && journeyEvents.length === 0) {
      setSaveError(tUI(langCode, "build.messages.events_required"));
      return;
    }

    setSaving(true);

    const translationsToSave = translations.concat(
      translations.some((row) => row.lang === translation.lang) ? [] : [translation],
    );
    const translationPayloads = translationsToSave
      .map((row) => ({
        lang: row.lang?.trim() ?? "",
        title: row.title || undefined,
        description: row.description || undefined,
      }))
      .filter((row) => row.lang);

    const mediaPayload = groupEventMedia
      .map((entry, index) => ({
        public_url: entry.public_url?.trim() || undefined,
        source_url: entry.source_url?.trim() || undefined,
        title: entry.title?.trim() || undefined,
        caption: entry.caption?.trim() || undefined,
        alt_text: entry.alt_text?.trim() || undefined,
        role: entry.role,
        sort_order: entry.sort_order ?? index,
        is_primary: entry.is_primary,
        kind: entry.kind,
      }))
      .filter((entry) => entry.public_url || entry.source_url);

    const payload: SaveJourneyPayload = {
      group_event_id: selectedJourneyId ?? undefined,
      group_event: {
        // Title is maintained in translations; group_events table no longer stores it.
        cover_url: ge.cover_url,
        visibility: ge.visibility,
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
      group_event_media: mediaPayload,
      events: [],
    };

    try {
      const res = await saveJourney(payload);
      const groupId = res.group_event_id;
      setSelectedJourneyId(groupId);

      let eventsError: any = null;
      const { events, delete_event_ids } = buildEventsPayload(groupId);
      if (events.length || delete_event_ids.length) {
        try {
          const eventsRes = await saveJourneyEvents({
            group_event_id: groupId,
            events,
            delete_event_ids,
          });
          setEventsSaveOk((eventsRes.event_ids?.length ?? 0).toString());
          setDeletedEventIds([]);
        } catch (err: any) {
          eventsError = err;
          setEventsSaveError(err?.message || "Errore salvataggio eventi.");
        }
      }

      await loadJourneys();
      await loadJourneyDetails(groupId);

      if (!eventsError) {
        setSaveOk({ id: groupId });
      } else if (!saveError) {
        setSaveError(eventsError?.message || tUI(langCode, "build.messages.events_save_error"));
      }
    } catch (err: any) {
      const msg = err?.message || tUI(langCode, "build.messages.save_error");
      setSaveError(msg);
      setEventsSaveError((prev) => prev || msg);
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteJourney() {
    if (!selectedJourneyId) return;
    if (!window.confirm(tUI(langCode, "build.messages.delete_confirm"))) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteOk(null);
    try {
      await deleteJourneyCascade(selectedJourneyId);
      setDeleteOk(tUI(langCode, "build.messages.delete_ok"));
      setSelectedJourneyId(null);
      resetForm();
      await loadJourneys();
    } catch (err: any) {
      setDeleteError(err?.message || tUI(langCode, "build.messages.delete_error"));
    } finally {
      setDeleting(false);
    }
  }

  async function onRequestApproval() {
    if (!selectedJourneyId) {
      setApprovalError(tUI(langCode, "build.messages.select_for_approval"));
      return;
    }
    setApprovalSaving(true);
    setApprovalError(null);
    setApprovalOk(null);
    try {
      const res = await requestJourneyApproval(selectedJourneyId);
      setApprovalOk(res.requested_approval_at || tUI(langCode, "build.messages.approval_sent"));
      setGe((prev) => ({ ...prev, workflow_state: "submitted", requested_approval_at: res.requested_approval_at || prev.requested_approval_at }));
      await loadJourneyDetails(selectedJourneyId);
    } catch (err: any) {
      setApprovalError(err?.message || tUI(langCode, "build.messages.approval_error"));
    } finally {
      setApprovalSaving(false);
    }
  }

  const handleModeration = useCallback(
    async (action: "approve" | "refuse") => {
      if (!selectedJourneyId) {
        setModerationError(tUI(langCode, "build.messages.select_for_approval"));
        return;
      }
      if (!canSaveMetadata) {
        setModerationError(tUI(langCode, "build.messages.metadata_required"));
        return;
      }

      setModerationSaving(true);
      setModerationError(null);
      setModerationOk(null);

      const now = new Date().toISOString();
      const translationsToSave = translations.concat(
        translations.some((row) => row.lang === translation.lang) ? [] : [translation],
      );
      const translationPayloads = translationsToSave
        .map((row) => ({
          lang: row.lang?.trim() ?? "",
          title: row.title || undefined,
          description: row.description || undefined,
        }))
        .filter((row) => row.lang);

      const mediaPayload = groupEventMedia
        .map((entry, index) => ({
          public_url: entry.public_url?.trim() || undefined,
          source_url: entry.source_url?.trim() || undefined,
          title: entry.title?.trim() || undefined,
          caption: entry.caption?.trim() || undefined,
          alt_text: entry.alt_text?.trim() || undefined,
          role: entry.role,
          sort_order: entry.sort_order ?? index,
          is_primary: entry.is_primary,
          kind: entry.kind,
        }))
        .filter((entry) => entry.public_url || entry.source_url);

      const payload: SaveJourneyPayload = {
        group_event_id: selectedJourneyId,
        group_event: {
          cover_url: ge.cover_url,
          visibility: ge.visibility,
          description: ge.description || undefined,
          language: ge.language || DEFAULT_LANGUAGE,
          slug: ge.slug || undefined,
          code: ge.code || undefined,
          workflow_state: action === "approve" ? "published" : "refused",
          owner_profile_id: ge.owner_profile_id || profile?.id || undefined,
          requested_approval_at: ge.requested_approval_at || undefined,
          approved_at: action === "approve" ? now : undefined,
          approved_by_profile_id: action === "approve" ? profile?.id || undefined : undefined,
          refused_at: action === "refuse" ? now : undefined,
          refused_by_profile_id: action === "refuse" ? profile?.id || undefined : undefined,
          refusal_reason: action === "refuse" ? ge.refusal_reason || "Rifiutato" : undefined,
          allow_fan: ge.allow_fan,
          allow_stud_high: ge.allow_stud_high,
          allow_stud_middle: ge.allow_stud_middle,
          allow_stud_primary: ge.allow_stud_primary,
        },
        group_event_translations: translationPayloads.length ? translationPayloads : undefined,
        deleted_group_event_translation_langs:
          deletedTranslationLangs.length > 0 ? deletedTranslationLangs : undefined,
        video_media_url: null,
        group_event_media: mediaPayload,
        events: [],
      };

      try {
        const res = await saveJourney(payload);
        await loadJourneys();
        await loadJourneyDetails(res.group_event_id);
        setModerationOk(action === "approve" ? "Journey approvato" : "Journey rifiutato");
      } catch (err: any) {
        setModerationError(err?.message || tUI(langCode, "build.messages.save_error"));
      } finally {
        setModerationSaving(false);
      }
    },
    [
      canSaveMetadata,
      deletedTranslationLangs,
      ge.allow_fan,
      ge.allow_stud_high,
      ge.allow_stud_middle,
      ge.allow_stud_primary,
      ge.code,
      ge.cover_url,
      ge.description,
      ge.language,
      ge.owner_profile_id,
      ge.refusal_reason,
      ge.requested_approval_at,
      ge.slug,
      ge.visibility,
      loadJourneyDetails,
      loadJourneys,
      groupEventMedia,
      langCode,
      profile?.id,
      selectedJourneyId,
      translation,
      translations,
    ],
  );


  const renderGroupEventPage = () => {
    const allowFlags: { key: AllowFlagKey; label: string }[] = [
      { key: "allow_fan", label: tUI(langCode, "build.audience.fan") },
      { key: "allow_stud_high", label: tUI(langCode, "build.audience.stud_high") },
      { key: "allow_stud_middle", label: tUI(langCode, "build.audience.stud_middle") },
      { key: "allow_stud_primary", label: tUI(langCode, "build.audience.stud_primary") },
    ];

    return (
      <section className="rounded-3xl border border-neutral-200/80 bg-white/80 backdrop-blur p-6 shadow-xl">
        <div className="mb-4 flex flex-nowrap items-center gap-2 rounded-2xl bg-white px-3 py-2">
          <div className="inline-flex flex-nowrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2 py-2 shadow-sm">
            <button
              type="button"
              className={`relative px-2.5 py-2 text-sm font-semibold transition whitespace-nowrap ${
                activeTab === "group" ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
              }`}
              onClick={() => {
                setActiveTab("group");
                setJourneySubTab("general");
              }}
            >
              {tUI(langCode, "build.tab.journey")}
              <span
                className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                  activeTab === "group" ? "bg-sky-600" : "bg-transparent"
                }`}
              />
            </button>
            <button
              type="button"
              className={`relative px-2.5 py-2 text-sm font-semibold transition whitespace-nowrap ${
                activeTab === "events" ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
              }`}
              onClick={() => {
                setActiveTab("events");
                if (selectedEventTempId) {
                  setEventTabMap((prev) => ({ ...prev, [selectedEventTempId]: "details" }));
                }
              }}
            >
              {tUI(langCode, "build.tab.events")}
              <span
                className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                  activeTab === "events" ? "bg-sky-600" : "bg-transparent"
                }`}
              />
            </button>
          </div>
          {activeTab === "group" && (
            <div className="inline-flex flex-nowrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2 py-2 shadow-sm">
              {[
                { value: "general", label: tUI(langCode, "build.group.tab.general") },
                { value: "translations", label: tUI(langCode, "build.group.tab.translations") },
                { value: "media", label: tUI(langCode, "build.group.tab.media") },
              ].map((tab) => {
                const isActive = journeySubTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    className={`relative px-3 py-2 text-sm font-semibold transition ${
                      isActive ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    onClick={() => setJourneySubTab(tab.value as typeof journeySubTab)}
                  >
                    {tab.label}
                    <span
                      className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                        isActive ? "bg-sky-600" : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
          {activeTab === "events" && (
            <div className="inline-flex flex-nowrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2 py-2 shadow-sm">
              {[
                { value: "details", label: tUI(langCode, "build.event.tab.when_where") },
                { value: "translations", label: tUI(langCode, "build.event.tab.translations") },
                { value: "media", label: tUI(langCode, "build.event.tab.media") },
                { value: "relations", label: tUI(langCode, "build.event.tab.details") },
              ].map((tab) => {
                const isActive = toolbarSelectedEventTab === tab.value;
                const disabled = !selectedEventTempId;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    className={`relative px-2.5 py-2 text-sm font-semibold transition whitespace-nowrap ${
                      disabled
                        ? "text-neutral-400 cursor-not-allowed"
                        : isActive
                        ? "text-sky-700"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    onClick={() => {
                      if (disabled || !selectedEventTempId) return;
                      setEventTabMap((prev) => ({ ...prev, [selectedEventTempId]: tab.value as EventTab }));
                    }}
                    disabled={disabled}
                  >
                    {tab.label}
                    <span
                      className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                        isActive ? "bg-sky-600" : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-nowrap items-center gap-2 ml-auto">
            <button
              type="button"
              className="h-9 w-24 rounded-full border border-sky-200 bg-white px-2.5 text-[11px] font-semibold text-sky-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 text-center"
              onClick={handleNewJourney}
            >
              {tUI(langCode, "build.actions.new")}
            </button>
            <button
              type="button"
              className={`h-9 w-24 rounded-full px-2.5 text-[11px] font-semibold shadow-md transition text-center ${
                selectedJourneyId && !moderationSaving
                  ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:shadow-lg"
                  : "bg-neutral-200 text-neutral-500"
              }`}
              disabled={!selectedJourneyId || moderationSaving}
              onClick={() => handleModeration("approve")}
            >
              {moderationSaving ? "..." : tUI(langCode, "build.actions.approve")}
            </button>
            <button
              type="button"
              className={`h-9 w-24 rounded-full px-2.5 text-[11px] font-semibold shadow-md transition text-center ${
                selectedJourneyId && !moderationSaving
                  ? "bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:shadow-lg"
                  : "bg-neutral-200 text-neutral-500"
              }`}
              disabled={!selectedJourneyId || moderationSaving}
              onClick={() => handleModeration("refuse")}
            >
              {moderationSaving ? "..." : tUI(langCode, "build.actions.refuse")}
            </button>
            <button
              type="button"
              className={`h-9 w-24 rounded-full px-2.5 text-[11px] font-semibold shadow-md transition text-center ${
                canSaveJourney && !saving
                  ? "bg-gradient-to-r from-sky-600 to-sky-500 text-white hover:shadow-lg"
                  : "bg-neutral-200 text-neutral-500"
              }`}
              disabled={!canSaveJourney || saving}
              onClick={onSave}
            >
              {saving ? tUI(langCode, "build.actions.save.loading") : tUI(langCode, "build.actions.save")}
            </button>
            <button
              type="button"
              className={`h-9 w-24 rounded-full px-2.5 text-[11px] font-semibold shadow-md transition text-center ${
                selectedJourneyId && !approvalSaving
                  ? "bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:shadow-lg"
                  : "bg-neutral-200 text-neutral-500"
              }`}
              disabled={!selectedJourneyId || approvalSaving}
              onClick={onRequestApproval}
            >
              {approvalSaving ? tUI(langCode, "build.actions.approval.loading") : tUI(langCode, "build.actions.approval")}
            </button>
            <button
              type="button"
              className={`h-9 w-24 rounded-full px-2.5 text-[11px] font-semibold shadow-md transition text-center ${
                selectedJourneyId && !deleting
                  ? "bg-gradient-to-r from-red-600 to-rose-500 text-white hover:shadow-lg"
                  : "bg-neutral-200 text-neutral-500"
              }`}
              disabled={!selectedJourneyId || deleting}
              onClick={onDeleteJourney}
            >
              {deleting ? tUI(langCode, "build.actions.delete.loading") : tUI(langCode, "build.actions.delete")}
            </button>
          </div>
        </div>

        {activeTab === "group" && (
          <div className="mt-6 space-y-6">

            {journeySubTab === "general" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Select
                        label={tUI(langCode, "build.group.visibility")}
                        value={ge.visibility}
                        onChange={(value) => setGe((prev) => ({ ...prev, visibility: value as Visibility }))}
                        options={[
                          { value: "private", label: tUI(langCode, "build.sidebar.filter.private") },
                          { value: "public", label: tUI(langCode, "build.sidebar.filter.public") },
                        ]}
                      />
                      <div>
                        <p className="mb-1 text-sm font-medium text-neutral-700">{tUI(langCode, "build.group.workflow")}</p>
                        <div className="rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-700">
                          {(ge.workflow_state || tUI(langCode, "build.group.workflow.draft")).replace(/_/g, " ")}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6">
                    <p className="text-sm font-semibold text-neutral-700">{tUI(langCode, "build.group.audience")}</p>
                    <div className="mt-3 flex flex-col gap-2">
                      {allowFlags.map((flag) => (
                        <label
                          key={flag.key}
                          className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 bg-white"
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
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label={tUI(langCode, "build.group.slug")}
                        value={ge.slug}
                        placeholder={tUI(langCode, "build.group.slug.placeholder")}
                        disabled
                      />
                      <Input
                        label={tUI(langCode, "build.group.code")}
                        value={ge.code}
                        placeholder={tUI(langCode, "build.group.code.placeholder")}
                        disabled
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6 space-y-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <ProfileField
                          label={tUI(langCode, "build.group.owner")}
                          profileId={ge.owner_profile_id}
                          displayName={getProfileDisplayName(ge.owner_profile_id)}
                          className="flex-1 min-w-[160px]"
                          size="sm"
                        />
                        <Input
                          label={tUI(langCode, "build.group.created_at")}
                          type="datetime-local"
                          value={toDateTimeLocalValue(ge.created_at)}
                          disabled
                          size="sm"
                          className="w-[135px]"
                        />
                        <Input
                          label={tUI(langCode, "build.group.updated_at")}
                          type="datetime-local"
                          value={toDateTimeLocalValue(ge.updated_at)}
                          disabled
                          size="sm"
                          className="w-[135px]"
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6 space-y-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <ProfileField
                          label={tUI(langCode, "build.group.approved_by")}
                          profileId={ge.approved_by_profile_id}
                          displayName={getProfileDisplayName(ge.approved_by_profile_id)}
                          className="flex-1 min-w-[160px]"
                          size="sm"
                        />
                        <Input
                          label={tUI(langCode, "build.group.approved_at")}
                          type="datetime-local"
                          value={toDateTimeLocalValue(ge.approved_at)}
                          disabled
                          size="sm"
                          className="w-[135px]"
                        />
                        <Input
                          label={tUI(langCode, "build.group.requested_at")}
                          type="datetime-local"
                          value={toDateTimeLocalValue(ge.requested_approval_at)}
                          disabled
                          size="sm"
                          className="w-[135px]"
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6 space-y-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <ProfileField
                          label={tUI(langCode, "build.group.refused_by")}
                          profileId={ge.refused_by_profile_id}
                          displayName={getProfileDisplayName(ge.refused_by_profile_id)}
                          className="flex-1 min-w-[160px]"
                          size="sm"
                        />
                        <Input
                          label={tUI(langCode, "build.group.refused_at")}
                          type="datetime-local"
                          value={toDateTimeLocalValue(ge.refused_at)}
                          disabled
                          size="sm"
                          className="w-[135px]"
                        />
                      </div>
                      <Textarea
                        label={tUI(langCode, "build.group.refusal_reason")}
                        value={ge.refusal_reason}
                        onChange={(value) => setGe((prev) => ({ ...prev, refusal_reason: value }))}
                        placeholder={tUI(langCode, "build.group.refusal_reason.placeholder")}
                        className="md:col-span-3"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "group" && journeySubTab === "media" && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6 space-y-3 mt-6">
            <div className="flex flex-nowrap items-center gap-2 border-b border-neutral-200 pb-3">
              <div className="flex flex-nowrap items-center gap-2">
                {["all", ...Array.from(new Set(groupEventMedia.map((m) => m.kind || "image")))].map((kind) => {
                  const isActive = mediaFilterKind === kind;
                  const label =
                    kind === "all"
                      ? tUI(langCode, "build.media.filter_all")
                      : mediaKindOptions.find((opt) => opt.value === kind)?.label || kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setMediaFilterKind(kind as MediaKind | "all")}
                      className={`relative px-3 py-2 text-sm font-semibold transition ${
                        isActive ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
                      }`}
                    >
                      {label}
                      <span
                        className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                          isActive ? "bg-sky-600" : "bg-transparent"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="ml-auto rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-neutral-400 whitespace-nowrap"
                onClick={addMediaItem}
              >
                + {tUI(langCode, "build.media.add")}
              </button>
            </div>
            {mediaFilterKind !== "all" && (
              <p className="text-xs text-neutral-500">
                {tUI(langCode, "build.media.filter_prefix")} {mediaKindOptions.find((opt) => opt.value === mediaFilterKind)?.label || mediaFilterKind}
              </p>
            )}
            {groupEventMedia.length === 0 ? (
              <p className="text-sm text-neutral-500">{tUI(langCode, "build.media.empty")}</p>
            ) : (
              <div className="space-y-3">
                {(mediaFilterKind === "all"
                  ? groupEventMedia
                  : groupEventMedia.filter((m) => m.kind === mediaFilterKind)
                ).map((media, index) => {
                  const originalIndex = groupEventMedia.findIndex((m) => m.tempId === media.tempId);
                  const safeIndex = originalIndex === -1 ? index : originalIndex;
                  const position = index + 1;
                  return (
                    <div
                      key={media.id ?? media.media_id ?? media.tempId ?? index}
                      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4"
                    >
                      <div className="grid gap-4 items-end sm:grid-cols-[110px_1fr_180px_auto]">
                        <Input
                          label={tUI(langCode, "build.media.order")}
                          type="number"
                          className="w-24"
                          value={(media.sort_order ?? position).toString()}
                          onChange={(value) =>
                            updateMediaItemField(safeIndex, "sort_order", value ? Number(value) : undefined)
                          }
                        />
                        <Input
                          label={tUI(langCode, "build.media.title")}
                          value={media.title}
                          onChange={(value) => updateMediaItemField(safeIndex, "title", value)}
                          placeholder={tUI(langCode, "build.media.title.placeholder")}
                        />
                        <Select
                          label={tUI(langCode, "build.media.type")}
                          value={media.kind}
                          onChange={(value) => updateMediaItemField(safeIndex, "kind", value as MediaKind)}
                          options={mediaKindOptions}
                        />
                        <button
                          type="button"
                          className="self-end text-xs font-semibold text-red-600"
                          onClick={() => removeMediaItem(safeIndex)}
                        >
                          {tUI(langCode, "build.media.delete")}
                        </button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          label={tUI(langCode, "build.media.public_url")}
                          value={media.public_url}
                          onChange={(value) => updateMediaItemField(safeIndex, "public_url", value)}
                          placeholder={tUI(langCode, "build.media.url.placeholder")}
                        />
                        <Input
                          label={tUI(langCode, "build.media.source_url")}
                          value={media.source_url}
                          onChange={(value) => updateMediaItemField(safeIndex, "source_url", value)}
                          placeholder={tUI(langCode, "build.media.url.placeholder")}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "group" && journeySubTab === "translations" && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 mt-6 space-y-4 min-h-[50vh]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                {translations.length === 0 ? (
                  <p className="text-sm text-neutral-500">{tUI(langCode, "build.translations.none")}</p>
                ) : (
                  translations.map((tr) => {
                    const isActive = tr.lang === selectedTranslationLang;
                    return (
                      <button
                        key={tr.lang}
                        type="button"
                        onClick={() => selectTranslation(tr.lang)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          isActive
                            ? "bg-sky-600 text-white shadow-sm"
                            : "bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300"
                        }`}
                      >
                        {tr.lang}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <Select
                  value={newTranslationLang}
                  onChange={(value) => setNewTranslationLang(value)}
                  options={[{ value: "", label: tUI(langCode, "build.translations.select") }, ...languageOptions]}
                  className="w-[190px]"
                />
                <button
                  type="button"
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={addTranslation}
                  disabled={!newTranslationLang.trim()}
                >
                  + {tUI(langCode, "build.translations.add")}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-red-600 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={removeTranslation}
                  disabled={translations.length <= 1}
                >
                  {tUI(langCode, "build.translations.remove")}
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
              <Input
                label={tUI(langCode, "build.translations.title")}
                value={translation.title}
                onChange={(value) => updateTranslationField("title", value)}
                placeholder={tUI(langCode, "build.translations.title.placeholder")}
              />
              <Textarea
                label={tUI(langCode, "build.translations.description")}
                value={translation.description}
                onChange={(value) => updateTranslationField("description", value)}
                placeholder={tUI(langCode, "build.translations.description.placeholder")}
                className="min-h-[200px]"
              />
            </div>
          </div>
        )}

        {activeTab === "events" && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 mt-6">
            <div className="mt-2 grid grid-cols-[320px_minmax(0,_1fr)] items-start gap-4">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 max-h-[60vh] overflow-y-auto space-y-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-700">{tUI(langCode, "build.events.list")}</p>
                  <button
                    type="button"
                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:border-neutral-400"
                    onClick={() => {
                      const newEvent = createEmptyEventEditor();
                      setJourneyEvents((prev) => [...prev, newEvent]);
                      setEventTabMap((prev) => ({ ...prev, [newEvent.tempId]: "details" }));
                      setSelectedEventTempId(newEvent.tempId);
                    }}
                  >
                    + {tUI(langCode, "build.events.add")}
                  </button>
                </div>
                {relatedEventsLoading ? (
                  <p className="text-sm text-neutral-500">{tUI(langCode, "build.events.loading")}</p>
                ) : relatedEventsError ? (
                  <p className="text-sm text-red-600">{relatedEventsError}</p>
                ) : journeyEvents.length === 0 ? (
                  <p className="text-sm text-neutral-500">{tUI(langCode, "build.events.empty")}</p>
                ) : (
                  sortedEvents.map((ev, idx) => {
                    const isActive = ev.tempId === selectedEventTempId;
                    return (
                      <button
                        key={ev.tempId}
                        type="button"
                        className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                          isActive
                            ? "border-sky-400 bg-white shadow-sm"
                            : "border-transparent bg-white/70 hover:border-neutral-200"
                        }`}
                        onClick={() => setSelectedEventTempId(ev.tempId)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-900">
                              {ev.translation.title || tUI(langCode, "build.events.new")}
                            </p>
                            <p className="text-xs text-neutral-500">{formatEventDateLabel(ev)}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-500">
                              #{idx + 1}
                            </span>
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveEvent(ev);
                              }}
                            >
                              {tUI(langCode, "build.events.delete")}
                            </button>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-3 max-h-[80vh] overflow-y-auto">
              {relatedEventsLoading ? (
                <p className="text-sm text-neutral-500">{tUI(langCode, "build.events.loading")}</p>
              ) : relatedEventsError ? (
                <p className="text-sm text-red-600">{relatedEventsError}</p>
              ) : journeyEvents.length === 0 ? (
                <p className="text-sm text-neutral-500">{tUI(langCode, "build.events.empty")}</p>
              ) : (
                  sortedEvents.map((ev, idx) => {
                    if (ev.tempId !== selectedEventTempId) return null;
                    const dateLabel = formatEventDateLabel(ev);
                  const activeEventTab = eventTabMap[ev.tempId] || "details";
                  return (
                    <div key={ev.tempId} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-neutral-800">{ev.translation.title || tUI(langCode, "build.events.new")}</p>
                            <p className="text-xs text-neutral-500">{dateLabel}</p>
                          </div>
                          <button
                            type="button"
                            className="text-xs font-semibold text-sky-700"
                            onClick={() => {
                              if (activeEventTab === "translations") {
                                const existing = new Set(ev.translations_all.map((tr) => tr.lang));
                                const nextLang =
                                  languageOptions.map((opt) => opt.value).find((lng) => !existing.has(lng)) || null;
                                if (!nextLang) {
                                  return;
                                }
                                setJourneyEvents((prev) =>
                                  prev.map((item) => {
                                    if (item.tempId !== ev.tempId) return item;
                                    const nextTranslation = createEmptyEventTranslation(nextLang);
                                    return {
                                      ...item,
                                      activeLang: nextLang,
                                      translation: { ...nextTranslation },
                                      translations_all: [...item.translations_all, nextTranslation],
                                    };
                                  }),
                                );
                              } else {
                                setJourneyEvents((prev) =>
                                  prev.map((item) =>
                                    item.tempId === ev.tempId
                                      ? { ...item, media: [...item.media, createEmptyGroupEventMediaItem()] }
                                      : item,
                                  ),
                                );
                              }
                            }}
                          >
                            +{" "}
                            {activeEventTab === "translations" ? "Traduzioni" : tUI(langCode, "build.media.add")}
                          </button>
                        </div>
                        <div className={`space-y-3 rounded-lg border border-neutral-200 bg-white p-3 ${activeEventTab === "details" ? "" : "hidden"}`}>
                          <div className="grid gap-3 md:grid-cols-4">
                            <Select
                              label={tUI(langCode, "build.events.era")}
                              value={ev.event.era || "AD"}
                              onChange={(value) =>
                                setJourneyEvents((prev) =>
                                  prev.map((item) =>
                                    item.tempId === ev.tempId
                                      ? { ...item, event: { ...item.event, era: (value as any) || "AD" } }
                                      : item,
                                  ),
                                )
                              }
                              options={[
                                { value: "AD", label: "AD" },
                                { value: "BC", label: "BC" },
                              ]}
                            />
                            <Input
                              label={tUI(langCode, "build.events.year_from")}
                              value={ev.event.year_from?.toString() ?? ""}
                              onChange={(value) =>
                                setJourneyEvents((prev) =>
                                  prev.map((item) =>
                                    item.tempId === ev.tempId
                                      ? { ...item, event: { ...item.event, year_from: value ? Number(value) : null } }
                                      : item,
                                  ),
                                )
                              }
                              type="number"
                            />
                            <Input
                              label={tUI(langCode, "build.events.year_to")}
                              value={ev.event.year_to?.toString() ?? ""}
                              onChange={(value) =>
                                setJourneyEvents((prev) =>
                                  prev.map((item) =>
                                    item.tempId === ev.tempId
                                      ? { ...item, event: { ...item.event, year_to: value ? Number(value) : null } }
                                      : item,
                                  ),
                                )
                              }
                              type="number"
                            />
                            <Input
                              label={tUI(langCode, "build.events.exact_date")}
                              value={ev.event.exact_date || ""}
                              onChange={(value) =>
                                setJourneyEvents((prev) =>
                                  prev.map((item) =>
                                    item.tempId === ev.tempId
                                      ? { ...item, event: { ...item.event, exact_date: value || null } }
                                      : item,
                                  ),
                                )
                              }
                              type="date"
                            />
                          </div>
                        <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
                          <div className="rounded-xl border border-neutral-200 bg-white p-3">
                            <div className="relative">
                              <button
                                type="button"
                                className="absolute left-3 top-3 z-10 flex items-center justify-center rounded-full border border-neutral-300 bg-white/90 p-2 text-xs font-semibold text-neutral-700 shadow-sm hover:border-neutral-400"
                                aria-label={tUI(langCode, "build.events.map.expand")}
                                onClick={() => setMapOverlayEventId(ev.tempId)}
                              >
                                <span aria-hidden="true">⤢</span>
                              </button>
                              <MapPicker
                                key={ev.tempId}
                                lat={ev.event.latitude ?? null}
                                lng={ev.event.longitude ?? null}
                                onChange={({ lat, lng }) => handleMapSelection(ev.tempId, lat, lng)}
                              />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                label={tUI(langCode, "build.events.latitude")}
                                className="sm:max-w-[180px]"
                                value={ev.event.latitude?.toString() ?? ""}
                                onChange={(value) =>
                                  setJourneyEvents((prev) =>
                                    prev.map((item) =>
                                      item.tempId === ev.tempId
                                        ? { ...item, event: { ...item.event, latitude: value ? Number(value) : null } }
                                        : item,
                                    ),
                                  )
                                }
                                type="number"
                              />
                              <Input
                                label={tUI(langCode, "build.events.longitude")}
                                className="sm:max-w-[180px]"
                                value={ev.event.longitude?.toString() ?? ""}
                                onChange={(value) =>
                                  setJourneyEvents((prev) =>
                                    prev.map((item) =>
                                      item.tempId === ev.tempId
                                        ? { ...item, event: { ...item.event, longitude: value ? Number(value) : null } }
                                        : item,
                                    ),
                                  )
                                }
                                type="number"
                              />
                            </div>
                            <Input
                              label={tUI(langCode, "build.events.continent")}
                              value={ev.event.continent || ""}
                              onChange={(value) =>
                                setJourneyEvents((prev) =>
                                  prev.map((item) =>
                                    item.tempId === ev.tempId
                                      ? { ...item, event: { ...item.event, continent: value || null } }
                                      : item,
                                  ),
                                )
                              }
                            />
                            <Input
                              label={tUI(langCode, "build.events.country")}
                              value={ev.event.country || ""}
                              onChange={(value) =>
                                setJourneyEvents((prev) =>
                                  prev.map((item) =>
                                    item.tempId === ev.tempId ? { ...item, event: { ...item.event, country: value || null } } : item,
                                  ),
                                )
                              }
                            />
                            <Input
                              label={tUI(langCode, "build.events.location")}
                              value={ev.event.location || ""}
                              onChange={(value) =>
                                setJourneyEvents((prev) =>
                                  prev.map((item) =>
                                    item.tempId === ev.tempId ? { ...item, event: { ...item.event, location: value || null } } : item,
                                  ),
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className={`space-y-3 rounded-lg border border-neutral-200 bg-white p-3 ${activeEventTab === "translations" ? "" : "hidden"}`}>
                          <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">{tUI(langCode, "build.events.language")}</p>
                          <div className="flex flex-wrap gap-2">
                            {Array.from(
                              new Set([ev.activeLang, ...ev.translations_all.map((t) => t.lang || DEFAULT_LANGUAGE)]),
                            ).map((lang) => {
                              const isActive = lang === ev.activeLang;
                              return (
                                <button
                                  key={`${ev.tempId}-${lang}`}
                                  type="button"
                                  onClick={() => {
                                    const nextLang = (lang || DEFAULT_LANGUAGE).trim() || DEFAULT_LANGUAGE;
                                    const existing = ev.translations_all.find((tr) => tr.lang === nextLang);
                                    setJourneyEvents((prev) =>
                                      prev.map((item) => {
                                        if (item.tempId !== ev.tempId) return item;
        const nextTranslation = existing || createEmptyEventTranslation(nextLang);
        const hasLang = item.translations_all.some((tr) => tr.lang === nextLang);
        return {
          ...item,
          activeLang: nextLang,
          translation: { ...nextTranslation },
          translations_all: hasLang ? item.translations_all : [...item.translations_all, nextTranslation],
        };
                                      }),
                                    );
                                  }}
                                  className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                                    isActive
                                      ? "bg-sky-600 text-white shadow-sm"
                                      : "bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300"
                                  }`}
                                >
                                  {lang}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                          <div className="grid gap-4 md:grid-cols-2">
                          <Input
                            label={tUI(langCode, "build.events.title")}
                            value={ev.translation.title}
                            onChange={(value) => {
                              setJourneyEvents((prev) =>
                                prev.map((item) => {
                                  if (item.tempId !== ev.tempId) return item;
                                  const nextTranslation = { ...item.translation, title: value, lang: item.activeLang };
                                  const updatedAll = item.translations_all.some((tr) => tr.lang === item.activeLang)
                                    ? item.translations_all.map((tr) =>
                                        tr.lang === item.activeLang ? { ...tr, title: value } : tr,
                                      )
                                    : [...item.translations_all, nextTranslation];
                                  return { ...item, translation: nextTranslation, translations_all: updatedAll };
                                }),
                              );
                            }}
                          />
                          <Input
                            label={tUI(langCode, "build.events.wikipedia")}
                            value={ev.translation.wikipedia_url}
                            onChange={(value) => {
                              setJourneyEvents((prev) =>
                                prev.map((item) => {
                                  if (item.tempId !== ev.tempId) return item;
                                  const nextTranslation = { ...item.translation, wikipedia_url: value, lang: item.activeLang };
                                  const updatedAll = item.translations_all.some((tr) => tr.lang === item.activeLang)
                                    ? item.translations_all.map((tr) =>
                                        tr.lang === item.activeLang ? { ...tr, wikipedia_url: value } : tr,
                                      )
                                    : [...item.translations_all, nextTranslation];
                                  return { ...item, translation: nextTranslation, translations_all: updatedAll };
                                }),
                              );
                            }}
                          />
                        </div>
                        <Textarea
                          label={tUI(langCode, "build.events.description")}
                          value={ev.translation.description}
                          onChange={(value) => {
                            setJourneyEvents((prev) =>
                              prev.map((item) => {
                                if (item.tempId !== ev.tempId) return item;
                                const nextTranslation = { ...item.translation, description: value, lang: item.activeLang };
                                const updatedAll = item.translations_all.some((tr) => tr.lang === item.activeLang)
                                  ? item.translations_all.map((tr) =>
                                      tr.lang === item.activeLang ? { ...tr, description: value } : tr,
                                    )
                                  : [...item.translations_all, nextTranslation];
                                return { ...item, translation: nextTranslation, translations_all: updatedAll };
                              }),
                            );
                          }}
                        />
                      </div>
                      <div className={`space-y-3 rounded-lg border border-neutral-200 bg-white p-3 ${activeEventTab === "relations" ? "" : "hidden"}`}>
                        <div className="space-y-2">
                          <Select
                            label={tUI(langCode, "build.events.type")}
                            value={ev.type_codes[0] || ""}
                            onChange={(value) =>
                              setJourneyEvents((prev) =>
                                prev.map((item) =>
                                  item.tempId === ev.tempId ? { ...item, type_codes: value ? [value] : [] } : item,
                                ),
                              )
                            }
                            options={[{ value: "", label: tUI(langCode, "build.events.type.placeholder") }, ...availableEventTypes.map((opt) => ({ value: opt.id, label: opt.label }))]}
                          />
                        </div>
                        <div className="space-y-2">
                        {(ev.correlations.length === 0 ? [{ group_event_id: "", correlation_type: "related" }] : ev.correlations).map(
                          (corr, cIdx) => (
                            <div key={cIdx} className="space-y-2">
                                <Select
                                label={tUI(langCode, "build.events.related_journey")}
                                value={corr.group_event_id || ""}
                                onChange={(value) =>
                                  setJourneyEvents((prev) =>
                                    prev.map((item) => {
                                      if (item.tempId !== ev.tempId) return item;
                                      const nextCorr = [...item.correlations];
                                      nextCorr[cIdx] = { ...nextCorr[cIdx], group_event_id: value };
                                      return { ...item, correlations: nextCorr };
                                    }),
                                  )
                                }
                                options={correlationJourneyOptions}
                              />
                            </div>
                          ),
                        )}
                        <button
                          type="button"
                          className="text-xs font-semibold text-neutral-700"
                          onClick={() =>
                            setJourneyEvents((prev) =>
                              prev.map((item) =>
                                item.tempId === ev.tempId
                                  ? { ...item, correlations: [...item.correlations, { group_event_id: "", correlation_type: "related" }] }
                                  : item,
                              ),
                            )
                          }
                        >
                          + {tUI(langCode, "build.events.add_relation")}
                        </button>
                      </div>
                      </div>
                      <div className={`space-y-3 rounded-lg border border-neutral-200 bg-white p-3 ${activeEventTab === "media" ? "" : "hidden"}`}>
                        {ev.media.length === 0 ? (
                          <p className="text-sm text-neutral-500">{tUI(langCode, "build.events.media.empty")}</p>
                        ) : (
                          ev.media.map((m, mIdx) => {
                            const itemPosition = mIdx + 1;
                            return (
                              <div key={m.tempId} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
                                <div className="grid gap-4 items-end sm:grid-cols-[110px_1fr_180px_auto]">
                                  <Input
                                    label={tUI(langCode, "build.media.order")}
                                    type="number"
                                    className="w-24"
                                    value={(m.sort_order ?? itemPosition).toString()}
                                    onChange={(value) =>
                                      setJourneyEvents((prev) =>
                                        prev.map((item) => {
                                          if (item.tempId !== ev.tempId) return item;
                                          const nextMedia = [...item.media];
                                          nextMedia[mIdx] = {
                                            ...nextMedia[mIdx],
                                            sort_order: value ? Number(value) : undefined,
                                          };
                                          return { ...item, media: nextMedia };
                                        }),
                                      )
                                    }
                                  />
                                  <Input
                                    label={tUI(langCode, "build.media.title")}
                                    value={m.title}
                                    onChange={(value) =>
                                      setJourneyEvents((prev) =>
                                        prev.map((item) => {
                                          if (item.tempId !== ev.tempId) return item;
                                          const nextMedia = [...item.media];
                                          nextMedia[mIdx] = { ...nextMedia[mIdx], title: value };
                                          return { ...item, media: nextMedia };
                                        }),
                                      )
                                    }
                                    placeholder={tUI(langCode, "build.media.title.placeholder")}
                                  />
                                  <Select
                                    label={tUI(langCode, "build.media.type")}
                                    value={m.kind}
                                    onChange={(value) =>
                                      setJourneyEvents((prev) =>
                                        prev.map((item) => {
                                          if (item.tempId !== ev.tempId) return item;
                                          const nextMedia = [...item.media];
                                          nextMedia[mIdx] = { ...nextMedia[mIdx], kind: value as MediaKind };
                                          return { ...item, media: nextMedia };
                                        }),
                                      )
                                    }
                                    options={mediaKindOptions}
                                  />
                                  <button
                                    type="button"
                                    className="self-end text-xs font-semibold text-red-600"
                                    onClick={() =>
                                      setJourneyEvents((prev) =>
                                        prev.map((item) =>
                                          item.tempId === ev.tempId
                                            ? { ...item, media: item.media.filter((_, idx) => idx !== mIdx) }
                                            : item,
                                        ),
                                      )
                                    }
                                  >
                                    {tUI(langCode, "build.media.delete")}
                                  </button>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  <Input
                                    label={tUI(langCode, "build.media.public_url")}
                                    value={m.public_url}
                                    placeholder={tUI(langCode, "build.media.url.placeholder")}
                                    onChange={(value) =>
                                      setJourneyEvents((prev) =>
                                        prev.map((item) => {
                                          if (item.tempId !== ev.tempId) return item;
                                          const nextMedia = [...item.media];
                                          nextMedia[mIdx] = { ...nextMedia[mIdx], public_url: value };
                                          return { ...item, media: nextMedia };
                                        }),
                                      )
                                    }
                                  />
                                  <Input
                                    label={tUI(langCode, "build.media.source_url")}
                                    value={m.source_url}
                                    placeholder={tUI(langCode, "build.media.url.placeholder")}
                                    onChange={(value) =>
                                      setJourneyEvents((prev) =>
                                        prev.map((item) => {
                                          if (item.tempId !== ev.tempId) return item;
                                          const nextMedia = [...item.media];
                                          nextMedia[mIdx] = { ...nextMedia[mIdx], source_url: value };
                                          return { ...item, media: nextMedia };
                                        }),
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-amber-50 via-sky-50 to-neutral-50 text-neutral-900 lg:flex">
      {mapOverlayEventId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
            <div className="p-4">
              {(() => {
                const ev = journeyEvents.find((item) => item.tempId === mapOverlayEventId);
                if (!ev) return null;
                return (
                  <div className="relative">
                    <button
                      type="button"
                      className="absolute left-3 top-3 z-10 flex items-center justify-center rounded-full border border-neutral-300 bg-white/90 p-2 text-xs font-semibold text-neutral-700 shadow-sm hover:border-neutral-400"
                      aria-label={tUI(langCode, "build.events.map.close")}
                      onClick={() => {
                        setMapOverlayEventId(null);
                      }}
                    >
                      <span aria-hidden="true">⤡</span>
                    </button>
                    <MapPicker
                      key={mapOverlayEventId}
                      lat={ev.event.latitude ?? null}
                      lng={ev.event.longitude ?? null}
                      initialZoom={0.25}
                      onChange={({ lat, lng }) => handleMapSelection(ev.tempId, lat, lng)}
                      className="h-[70vh] w-full rounded-2xl border border-neutral-200 overflow-hidden"
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-10 w-full max-w-[320px] transform bg-white/80 backdrop-blur shadow-lg transition duration-300 ease-in-out lg:static lg:translate-x-0 lg:border-r lg:border-neutral-200/80 lg:h-screen lg:overflow-y-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } h-screen overflow-y-auto`}
      >
        <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-neutral-200 bg-white/90 px-4 py-5 backdrop-blur">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[200px] rounded-2xl border border-neutral-200 bg-white/80 px-3 py-2 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  {tUI(langCode, "build.sidebar.visibility")}
                </p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {journeyFilterOptions.map((option) => {
                  const isActive = journeyFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-full border px-2 py-1 text-xs font-semibold transition whitespace-normal leading-tight min-w-[70px] text-center ${
                        isActive
                          ? "border-sky-500 bg-sky-50 text-sky-700 shadow-sm"
                          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-800"
                      }`}
                      onClick={() => setJourneyFilter(option.value)}
                      aria-pressed={isActive}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 min-w-[200px] rounded-2xl border border-neutral-200 bg-white/80 px-3 py-2 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {tUI(langCode, "build.sidebar.status")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {journeyStatusOptions.map((option) => {
                  const isActive = journeyStatusFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-full border px-2 py-1 text-xs font-semibold transition whitespace-normal leading-tight min-w-[70px] text-center ${
                        isActive
                          ? "border-sky-500 bg-sky-50 text-sky-700 shadow-sm"
                          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-800"
                      }`}
                      onClick={() => setJourneyStatusFilter(option.value)}
                      aria-pressed={isActive}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex-1 min-w-[200px] rounded-2xl border border-neutral-200 bg-white/80 px-3 py-2 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {tUI(langCode, "build.sidebar.order")}
              </p>
              <div className="mt-2 flex flex-nowrap items-center gap-1 overflow-hidden">
                {journeySortOptions.map((option) => {
                  const isActive = journeySort === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-full border px-2 py-1 text-xs font-semibold transition whitespace-nowrap min-w-[90px] text-center ${
                        isActive
                          ? "border-sky-500 bg-sky-50 text-sky-700 shadow-sm"
                          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-800"
                      }`}
                      onClick={() => setJourneySort(option.value)}
                      aria-pressed={isActive}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="ml-auto rounded-full border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-600 shadow-sm hover:border-neutral-400 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              {tUI(langCode, "build.actions.close")}
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            {`${filteredJourneys.length} Journeys`}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {journeysLoading ? (
            <p className="text-sm text-neutral-500">{tUI(langCode, "build.sidebar.loading")}</p>
          ) : journeysError ? (
            <p className="text-sm text-red-600">{journeysError}</p>
          ) : journeys.length === 0 ? (
            <p className="text-sm text-neutral-500">{tUI(langCode, "build.sidebar.empty")}</p>
          ) : filteredJourneys.length === 0 ? (
            <p className="text-sm text-neutral-500">{tUI(langCode, "build.sidebar.no_match")}</p>
          ) : (
            <ul className="space-y-3">
              {filteredJourneys.map((journey) => (
                <Scorecard
                  key={journey.id}
                  title={journey.title || tUI(langCode, "journey.title_fallback")}
                  coverUrl={journey.coverUrl ?? undefined}
                  publishedAt={journey.publishedAt ?? null}
                  eventsCount={journey.eventsCount ?? null}
                  yearFrom={journey.yearFrom ?? null}
                  yearTo={journey.yearTo ?? null}
                  ctaLabel={tUI(langCode, "build.actions.edit")}
                  className="w-full"
                  liProps={{
                    className: selectedJourneyId === journey.id ? "border-sky-500 bg-sky-50" : "",
                  }}
                  averageRating={journeyRatingMap[journey.id]?.avg_rating ?? null}
                  ratingsCount={journeyRatingMap[journey.id]?.ratings_count ?? null}
                  favouriteToggleDisabled
                  prefetch={false}
                  onCardClick={() => selectJourney(journey.id)}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-neutral-200 px-4 py-4 text-xs text-neutral-500">
          {checking
            ? tUI(langCode, "build.sidebar.checking")
            : profile
            ? ""
            : profileError
            ? profileError
            : tUI(langCode, "build.sidebar.login")}
        </div>
      </aside>
      <main className="flex-1 h-full overflow-auto p-6">
        <div className="mb-3 flex items-center gap-3 lg:hidden">
          <button
            type="button"
            className="rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm"
            onClick={() => setSidebarOpen(true)}
          >
            {tUI(langCode, "build.actions.show_journeys")}
          </button>
        </div>
        <div className="mb-2" />
        <div className="space-y-4">
          {journeyDetailsError && <p className="text-sm text-red-600">{journeyDetailsError}</p>}
          {renderGroupEventPage()}
        </div>
        {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
        {eventsSaveError && <p className="mt-1 text-sm text-red-600">{eventsSaveError}</p>}
        {eventsSaveOk && <p className="mt-1 text-sm text-green-700">{`${tUI(langCode, "build.messages.events_saved_prefix")} ${eventsSaveOk}`}</p>}
        {approvalError && <p className="mt-1 text-sm text-red-600">{approvalError}</p>}
        {approvalOk && <p className="mt-1 text-sm text-green-700">{approvalOk}</p>}
        {moderationError && <p className="mt-1 text-sm text-red-600">{moderationError}</p>}
        {moderationOk && <p className="mt-1 text-sm text-green-700">{moderationOk}</p>}
        {deleteError && <p className="mt-1 text-sm text-red-600">{deleteError}</p>}
        {deleteOk && <p className="mt-1 text-sm text-green-700">{deleteOk}</p>}
      </main>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  className,
  type = "text",
  disabled = false,
  readOnly = false,
  size = "md",
}: {
  label?: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  disabled?: boolean;
  readOnly?: boolean;
  size?: "sm" | "md";
}) {
  const sizeClasses = size === "sm" ? "py-1.5 px-2 text-xs" : "py-2 px-3 text-sm";
  const labelClasses = size === "sm" ? "text-[11px]" : "text-sm";
  return (
    <div className={className}>
      {label && <label className={`block font-medium mb-1 ${labelClasses}`}>{label}</label>}
      <input
        type={type}
        className={`w-full rounded-xl border border-neutral-200 bg-white/80 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 disabled:shadow-none ${sizeClasses}`}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        readOnly={readOnly || disabled}
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  readOnly = false,
}: {
  label?: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <textarea
        className="w-full min-h-[96px] rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 disabled:shadow-none"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        readOnly={readOnly || disabled}
      />
    </div>
  );
}

function Select({ label, value, onChange, options, className }: { label?: string; value?: string; onChange?: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <select
        className="w-full rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70"
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
  size = "md",
}: {
  label: string;
  profileId?: string | null;
  displayName?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const textClasses = size === "sm" ? "text-xs" : "text-sm";
  const labelClasses = size === "sm" ? "text-[11px]" : "text-sm";
  return (
    <div className={className}>
      <label className={`block font-medium mb-1 ${labelClasses}`}>{label}</label>
      <div className={`rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-neutral-500 ${textClasses}`}>
        {displayName || (profileId ? "Nome non disponibile" : "Non assegnato")}
      </div>
    </div>
  );
}

function MapPicker({
  lat,
  lng,
  onChange,
  className,
  initialZoom,
}: {
  lat?: number | null;
  lng?: number | null;
  onChange?: (coords: { lat: number; lng: number }) => void;
  className?: string;
  initialZoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Default center over Italy to keep context relevant.
  const fallbackCenter: [number, number] = [12.4964, 41.9028];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          esri: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "",
          },
          esriLabels: {
            type: "raster",
            tiles: [
              "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "",
          },
        },
        layers: [
          {
            id: "esri",
            type: "raster",
            source: "esri",
          },
          {
            id: "esri-labels",
            type: "raster",
            source: "esriLabels",
          },
        ],
      },
      center: [lng ?? fallbackCenter[0], lat ?? fallbackCenter[1]],
      zoom: initialZoom ?? (lat != null && lng != null ? 1.2 : 0.2),
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("click", (e) => {
      const { lat: newLat, lng: newLng } = e.lngLat;
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: "#0ea5e9" }).setLngLat([newLng, newLat]).addTo(map);
      } else {
        markerRef.current.setLngLat([newLng, newLat]);
      }
      onChange?.({ lat: newLat, lng: newLng });
    });
    mapRef.current = map;

    return () => {
      try {
        map.remove();
      } catch {
        // ignore cleanup errors
      }
      mapRef.current = null;
      markerRef.current = null;
    };
  // Mount map only once; marker updates are handled in the lat/lng effect below.
  }, [initialZoom]);

  // Keep marker in sync when coordinates change from inputs.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat != null && lng != null) {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: "#0ea5e9" }).setLngLat([lng, lat]).addTo(map);
      } else {
        markerRef.current.setLngLat([lng, lat]);
      }
      try {
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 6), speed: 0.6 });
      } catch {
        // ignore fly errors
      }
    }
  }, [lat, lng]);

  return <div ref={containerRef} className={className ?? "h-64 w-full rounded-xl border border-neutral-200 overflow-hidden"} />;
}

