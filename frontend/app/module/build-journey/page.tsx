
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
} from "./actions";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Scorecard } from "@/app/components/Scorecard";

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
  short_name: string;
  description: string;
  video_url: string;
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

type JourneyFilterValue = "all" | Visibility;

const JOURNEY_FILTER_OPTIONS: { value: JourneyFilterValue; label: string }[] = [
  { value: "all", label: "Tutti i miei video" },
  { value: "private", label: "Solo quelli privati" },
  { value: "public", label: "Solo quelli pubblici" },
];

type JourneySortValue = "approved_desc" | "approved_asc";

const JOURNEY_SORT_OPTIONS: { value: JourneySortValue; label: string }[] = [
  { value: "approved_desc", label: "Ultimi approvati" },
  { value: "approved_asc", label: "Primi approvati" },
];

type JourneyRating = {
  avg_rating: number | null;
  ratings_count: number | null;
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
  const [groupEventMedia, setGroupEventMedia] = useState<GroupEventMediaItem[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [journeyVisibilityMap, setJourneyVisibilityMap] = useState<Record<string, Visibility>>({});
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilterValue>("all");
  const [journeySort, setJourneySort] = useState<JourneySortValue>("approved_desc");
  const [journeyRatingMap, setJourneyRatingMap] = useState<Record<string, JourneyRating>>({});
  const [activeTab, setActiveTab] = useState<"group" | "translations" | "media" | "events">("group");
  const [availableEventTypes, setAvailableEventTypes] = useState<{ id: string; label: string }[]>([]);
  const [journeyEvents, setJourneyEvents] = useState<JourneyEventEditor[]>([]);
  const [selectedEventTempId, setSelectedEventTempId] = useState<string | null>(null);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [eventsSaving, setEventsSaving] = useState(false);
  const [eventsSaveError, setEventsSaveError] = useState<string | null>(null);
  const [eventsSaveOk, setEventsSaveOk] = useState<string | null>(null);
  const [relatedEvents, setRelatedEvents] = useState<JourneyEventSummary[]>([]);
  const [relatedEventsLoading, setRelatedEventsLoading] = useState(false);
  const [relatedEventsError, setRelatedEventsError] = useState<string | null>(null);
  const [eventTabMap, setEventTabMap] = useState<Record<string, EventTab>>({});
  const [mediaFilterKind, setMediaFilterKind] = useState<MediaKind | "all">("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const selectedJourney = useMemo(() => journeys.find((j) => j.id === selectedJourneyId) ?? null, [journeys, selectedJourneyId]);
  const filteredJourneys = useMemo(() => {
    if (journeyFilter === "all") {
      return journeys;
    }
    return journeys.filter((journey) => journeyVisibilityMap[journey.id] === journeyFilter);
  }, [journeyFilter, journeyVisibilityMap, journeys]);
  const sortedEvents = useMemo(() => {
    const toSortValue = (ev: JourneyEventEditor): number => {
      if (ev.event.year_from != null) return ev.event.year_from;
      if (ev.event.exact_date) {
        const parsed = new Date(ev.event.exact_date);
        if (!isNaN(parsed.getTime())) return parsed.getTime();
      }
      if (ev.event.year_to != null) return ev.event.year_to;
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
  }, [profile?.id]);

  const handleNewJourney = () => {
    setSelectedJourneyId(null);
    resetForm();
    setSaveError(null);
    setSaveOk(null);
  };

  const loadEventTypes = useCallback(async () => {
    try {
      const { data: typeRows } = await supabase.from("event_types").select("id,code,label,name");
      if (typeRows) {
        const codes = Array.from(
          new Map(
            typeRows
              .map((row: any) => {
                const id = row?.id ? String(row.id).trim() : "";
                const label = row?.label || row?.code || row?.name || id;
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
        .select("id,visibility")
        .in("id", ownerIds);
      if (visibilityError) throw visibilityError;
      const visibilityMap: Record<string, Visibility> = {};
      (visibilityRows ?? []).forEach((row) => {
        if (row.id && (row.visibility === "private" || row.visibility === "public")) {
          visibilityMap[row.id] = row.visibility as Visibility;
        }
      });
      setJourneyVisibilityMap(visibilityMap);

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
      setJourneysError(err?.message || "Impossibile caricare i journeys.");
    } finally {
      setJourneysLoading(false);
    }
  }, [profile?.id, supabase, journeySort]);

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
        const { data: evData, error: evError } = await supabase
          .from("event_group_event")
          .select("event_id, added_by_user_ref, events_list!inner(id,created_at,year_from,year_to,era,exact_date,country,location,continent,latitude,longitude,geom,source_event_id,image_url,images,event_types_id)")
          .eq("group_event_id", journeyId)
          .order("created_at", { ascending: true });
        if (evError) throw evError;
        const rows = (evData ?? []) as any[];
        const eventIds = rows
          .map((row) => row.event_id || row.events_list?.id)
          .filter((id): id is string => Boolean(id));

        const translationsMap: Record<string, { primary: JourneyEventEditor["translation"]; all: JourneyEventEditor["translations_all"] }> = {};
        if (eventIds.length) {
          const { data: trData } = await supabase
            .from("event_translations")
            .select("id, event_id, lang, title, description_short, description, wikipedia_url, video_url")
            .in("event_id", eventIds);
          (trData ?? []).forEach((row: any) => {
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
        }

        const corrMap: Record<string, { group_event_id: string; correlation_type?: string | null }[]> = {};
        if (eventIds.length) {
          const { data: corrRows } = await supabase
            .from("event_group_event_correlated")
            .select("event_id, group_event_id, correlation_type")
            .in("event_id", eventIds);
          (corrRows ?? []).forEach((row: any) => {
            if (!row?.event_id || !row?.group_event_id) return;
            corrMap[row.event_id] = corrMap[row.event_id] || [];
            corrMap[row.event_id].push({
              group_event_id: row.group_event_id,
              correlation_type: row.correlation_type ?? "related",
            });
          });
        }

        const mediaMap: Record<string, GroupEventMediaItem[]> = {};
        if (eventIds.length) {
          const { data: mediaRows } = await supabase
            .from("v_media_attachments_expanded")
            .select(
              "id,media_id,entity_type,role,title,caption,alt_text,is_primary,sort_order,public_url,source_url,media_type,event_id",
            )
            .eq("entity_type", "event")
            .in("event_id", eventIds)
            .order("sort_order", { ascending: true });
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
        }

        const mapped: JourneyEventEditor[] = rows.map((row) => {
          const ev = row.events_list || {};
          const eventId = row.event_id || ev.id;
          const tr = translationsMap[eventId]?.primary || {
            ...createEmptyEventTranslation(DEFAULT_LANGUAGE),
          };
          const trAll = translationsMap[eventId]?.all || [createEmptyEventTranslation(DEFAULT_LANGUAGE)];
          const media = mediaMap[eventId] || [];
          const rawTypes = ev.event_types_id;
          const type_codes = Array.isArray(rawTypes)
            ? rawTypes.map((t: any) => String(t).trim()).filter(Boolean)
            : rawTypes
            ? [String(rawTypes).trim()]
            : [];
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
            title: ev.translation.title || "(Untitled event)",
            description_short: ev.translation.description_short,
            exact_date: ev.event.exact_date,
            year_from: ev.event.year_from,
            year_to: ev.event.year_to,
            country: ev.event.country,
            location: ev.event.location,
          })),
        );
      } catch (evErr: any) {
        setRelatedEventsError(evErr?.message || "Errore nel caricamento degli eventi collegati.");
      } finally {
        setRelatedEventsLoading(false);
      }

    } catch (err: any) {
      setJourneyDetailsError(err?.message || "Errore durante il caricamento dei dettagli.");
    } finally {
      setLoadingJourneyDetails(false);
    }
  }, [supabase, profile?.id, setGroupEventMedia]);

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
    if (ev.event.year_from && ev.event.year_to) return `${ev.event.year_from}-${ev.event.year_to}`;
    if (ev.event.year_from) return `${ev.event.year_from}`;
    if (ev.event.year_to) return `${ev.event.year_to}`;
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
      group_event_media: mediaPayload,
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
      <section className="rounded-3xl border border-neutral-200/80 bg-white/80 backdrop-blur p-6 shadow-xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-100 px-3 py-2">
          <button
            type="button"
            className="rounded-full border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 shadow-sm hover:border-sky-300 hover:bg-sky-50"
            onClick={handleNewJourney}
          >
            New
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold shadow-md transition ${
              canSaveJourney && !saving
                ? "bg-gradient-to-r from-sky-600 to-sky-500 text-white hover:shadow-lg"
                : "bg-neutral-200 text-neutral-500"
            }`}
            disabled={!canSaveJourney || saving}
            onClick={onSave}
          >
            {saving ? "Salvataggio..." : "Save"}
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-neutral-100/90 px-2 py-2 shadow-sm">
          <button
            type="button"
            className={`relative px-3 py-2 text-sm font-semibold transition ${
              activeTab === "group" ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
            }`}
            onClick={() => setActiveTab("group")}
          >
            Group events
            <span
              className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                activeTab === "group" ? "bg-sky-600" : "bg-transparent"
              }`}
            />
          </button>
          <button
            type="button"
            className={`relative px-3 py-2 text-sm font-semibold transition ${
              activeTab === "translations" ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
            }`}
            onClick={() => setActiveTab("translations")}
          >
            Group translations
            <span
              className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                activeTab === "translations" ? "bg-sky-600" : "bg-transparent"
              }`}
            />
          </button>
          <button
            type="button"
            className={`relative px-3 py-2 text-sm font-semibold transition ${
              activeTab === "media" ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
            }`}
            onClick={() => setActiveTab("media")}
          >
            Group media
            <span
              className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                activeTab === "media" ? "bg-sky-600" : "bg-transparent"
              }`}
            />
          </button>
          <button
            type="button"
            className={`relative px-3 py-2 text-sm font-semibold transition ${
              activeTab === "events" ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
            }`}
            onClick={() => setActiveTab("events")}
          >
            Eventi
            <span
              className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                activeTab === "events" ? "bg-sky-600" : "bg-transparent"
              }`}
            />
          </button>
        </div>

        {activeTab === "group" && (
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
          </div>
        )}

        {activeTab === "media" && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6 space-y-4 mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-700">Media</p>
                <p className="text-xs text-neutral-500">Gestisci gli asset collegati al journey.</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-neutral-400"
                onClick={addMediaItem}
              >
                + Nuovo media
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3">
              {["all", ...Array.from(new Set(groupEventMedia.map((m) => m.kind || "image")))].map((kind) => {
                const isActive = mediaFilterKind === kind;
                const label =
                  kind === "all"
                    ? "Tutti"
                    : MEDIA_KIND_OPTIONS.find((opt) => opt.value === kind)?.label || kind;
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
            {mediaFilterKind !== "all" && (
              <p className="text-xs text-neutral-500">
                Filtrati media di tipo: {MEDIA_KIND_OPTIONS.find((opt) => opt.value === mediaFilterKind)?.label || mediaFilterKind}
              </p>
            )}
            {groupEventMedia.length === 0 ? (
              <p className="text-sm text-neutral-500">Nessun media collegato.</p>
            ) : (
              <div className="space-y-3">
                {(mediaFilterKind === "all"
                  ? groupEventMedia
                  : groupEventMedia.filter((m) => m.kind === mediaFilterKind)
                ).map((media, index) => {
                  const originalIndex = groupEventMedia.findIndex((m) => m.tempId === media.tempId);
                  const position = (originalIndex >= 0 ? originalIndex : index) + 1;
                  const safeIndex = originalIndex >= 0 ? originalIndex : index;
                  return (
                    <div
                      key={media.id ?? media.media_id ?? media.tempId ?? index}
                      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                          Posizione {position}
                        </p>
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-600"
                          onClick={() => removeMediaItem(safeIndex)}
                        >
                          Elimina
                        </button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          label="URL pubblico"
                          value={media.public_url}
                          onChange={(value) => updateMediaItemField(safeIndex, "public_url", value)}
                          placeholder="https://"
                        />
                        <Input
                          label="URL sorgente"
                          value={media.source_url}
                          onChange={(value) => updateMediaItemField(safeIndex, "source_url", value)}
                          placeholder="https://"
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Input
                          label="Titolo"
                          value={media.title}
                          onChange={(value) => updateMediaItemField(safeIndex, "title", value)}
                          placeholder="Titolo asset"
                        />
                        <Input
                          label="Didascalia"
                          value={media.caption}
                          onChange={(value) => updateMediaItemField(safeIndex, "caption", value)}
                          placeholder="Didascalia"
                        />
                        <Input
                          label="Alt text"
                          value={media.alt_text}
                          onChange={(value) => updateMediaItemField(safeIndex, "alt_text", value)}
                          placeholder="Alt text"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Select
                          label="Tipo"
                          value={media.kind}
                          onChange={(value) => updateMediaItemField(safeIndex, "kind", value as MediaKind)}
                          options={MEDIA_KIND_OPTIONS}
                        />
                        <Input
                          label="Ordine"
                          type="number"
                          value={(media.sort_order ?? position).toString()}
                          onChange={(value) => updateMediaItemField(safeIndex, "sort_order", value ? Number(value) : undefined)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "translations" && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 mt-6 space-y-4 min-h-[80vh]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Lingue disponibili</p>
                <p className="text-sm text-neutral-500">Seleziona una lingua per modificare la traduzione.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  className="w-[120px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="es. en"
                  value={newTranslationLang}
                  onChange={(e) => setNewTranslationLang(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:border-neutral-400"
                  onClick={addTranslation}
                >
                  + Aggiungi lingua
                </button>
                <button
                  type="button"
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-red-600 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={removeTranslation}
                  disabled={translations.length <= 1}
                >
                  Rimuovi lingua
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2 border-b border-neutral-200 pb-2">
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
            </div>

            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
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
                className="min-h-[320px]"
              />
              <Input
                label="Video URL"
                value={translation.video_url}
                onChange={(value) => updateTranslationField("video_url", value)}
                placeholder="https://"
              />
            </div>

            <div className="border-t border-neutral-200 pt-4">
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
        )}

        {activeTab === "events" && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 mt-6">
            <div className="mt-2 grid grid-cols-[320px_minmax(0,_1fr)] items-start gap-4">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 max-h-[60vh] overflow-y-auto space-y-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-neutral-700">Eventi</p>
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
                    + Aggiungi evento
                  </button>
                </div>
                {relatedEventsLoading ? (
                  <p className="text-sm text-neutral-500">Caricamento eventi.</p>
                ) : relatedEventsError ? (
                  <p className="text-sm text-red-600">{relatedEventsError}</p>
                ) : journeyEvents.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessun evento collegato.</p>
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
                              {ev.translation.title || "(Nuovo evento)"}
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
                              Elimina
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
                  <p className="text-sm text-neutral-500">Caricamento eventi…</p>
                ) : relatedEventsError ? (
                  <p className="text-sm text-red-600">{relatedEventsError}</p>
                ) : journeyEvents.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessun evento collegato.</p>
                ) : (
                  sortedEvents.map((ev, idx) => {
                    if (ev.tempId !== selectedEventTempId) return null;
                    const dateLabel = formatEventDateLabel(ev);
                  const eventTabs: { value: EventTab; label: string }[] = [
                    { value: "details", label: "Dettagli" },
                    { value: "translations", label: "Traduzioni" },
                    { value: "relations", label: "Tipi e correlazioni" },
                    { value: "media", label: "Media" },
                  ];
                  const activeEventTab = eventTabMap[ev.tempId] || "details";
                  return (
                    <div key={ev.tempId} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {eventTabs.map((tab) => {
                            const isActive = tab.value === activeEventTab;
                            return (
                              <button
                                key={tab.value}
                              type="button"
                              onClick={() =>
                                setEventTabMap((prev) => ({
                                  ...prev,
                                  [ev.tempId]: tab.value,
                                }))
                              }
                              className={`relative px-3 py-2 text-sm font-semibold transition ${
                                isActive ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
                              }`}
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
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:border-neutral-400"
                              disabled={!selectedJourneyId || eventsSaving}
                              onClick={async () => {
                                if (!selectedJourneyId) return;
                                setEventsSaving(true);
                                setEventsSaveError(null);
                                setEventsSaveOk(null);
                                const eventsPayload: JourneyEventEditPayload[] = journeyEvents.map((ev) => ({
                                  event_id: ev.event_id,
                                  added_by_user_ref: ev.added_by_user_ref ?? null,
                                  event: { ...ev.event },
                                  translation: { ...ev.translation },
                                  translations: ev.translations_all,
                                  type_codes: ev.type_codes,
                                  correlations: ev.correlations.filter((c) => c.group_event_id),
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
                                }));
                                try {
                                  const res = await saveJourneyEvents({
                                    group_event_id: selectedJourneyId,
                                    events: eventsPayload,
                                    delete_event_ids: deletedEventIds,
                                  });
                                  setEventsSaveOk(res.event_ids?.join(", "));
                                  setDeletedEventIds([]);
                                  await loadJourneyDetails(selectedJourneyId);
                                } catch (err: any) {
                                  setEventsSaveError(err?.message || "Errore salvataggio eventi.");
                                } finally {
                                  setEventsSaving(false);
                                }
                              }}
                            >
                              {eventsSaving ? "Salvataggio..." : "Salva eventi"}
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-red-600"
                              onClick={() => handleRemoveEvent(ev)}
                            >
                              Elimina
                            </button>
                          </div>
                        </div>
                        <div className={`space-y-3 rounded-lg border border-neutral-200 bg-white p-3 ${activeEventTab === "details" ? "" : "hidden"}`}>
                          <div className="grid gap-3 md:grid-cols-4">
                            <Select
                              label="Era"
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
                              label="Anno da"
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
                              label="Anno a"
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
                              label="Data esatta"
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
                            <MapPicker
                              lat={ev.event.latitude ?? null}
                              lng={ev.event.longitude ?? null}
                              onChange={({ lat, lng }) =>
                                setJourneyEvents((prev) =>
                                  prev.map((item) => {
                                    if (item.tempId !== ev.tempId) return item;
                                    const continentGuess = inferContinentFromCoords(lat, lng);
                                    const hint = `Lat ${lat.toFixed(3)}, Lon ${lng.toFixed(3)}`;
                                    return {
                                      ...item,
                                      event: {
                                        ...item.event,
                                        latitude: lat,
                                        longitude: lng,
                                        continent: continentGuess ?? item.event.continent ?? hint,
                                        country: item.event.country ?? "",
                                        location: item.event.location ?? "",
                                      },
                                    };
                                  }),
                                )
                              }
                            />
                          </div>
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                label="Latitudine"
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
                                label="Longitudine"
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
                              label="Continent"
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
                              label="Paese"
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
                              label="Luogo"
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
                          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Lingua</p>
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
                            label="Titolo"
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
                            label="Wikipedia URL"
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
                          label="Descrizione"
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
                          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Tipo evento</p>
                          <select
                            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                            value={ev.type_codes[0] || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setJourneyEvents((prev) =>
                                prev.map((item) =>
                                  item.tempId === ev.tempId ? { ...item, type_codes: value ? [value] : [] } : item,
                                ),
                              );
                            }}
                          >
                            <option value="">Seleziona tipo</option>
                            {availableEventTypes.map((opt) => (
                              <option key={`${ev.tempId}-opt-${opt.id}`} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Correlazioni (event_group_event_correlated)</p>
                        {(ev.correlations.length === 0 ? [{ group_event_id: "", correlation_type: "related" }] : ev.correlations).map(
                          (corr, cIdx) => (
                            <div key={cIdx} className="grid gap-3 md:grid-cols-2">
                              <Input
                                label="Group event ID"
                                value={corr.group_event_id}
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
                              />
                              <Input
                                label="Correlation type"
                                value={corr.correlation_type || "related"}
                                onChange={(value) =>
                                  setJourneyEvents((prev) =>
                                    prev.map((item) => {
                                      if (item.tempId !== ev.tempId) return item;
                                      const nextCorr = [...item.correlations];
                                      nextCorr[cIdx] = { ...nextCorr[cIdx], correlation_type: value || "related" };
                                      return { ...item, correlations: nextCorr };
                                    }),
                                  )
                                }
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
                          + Aggiungi correlazione
                        </button>
                      </div>
                      </div>
                      <div className={`space-y-3 rounded-lg border border-neutral-200 bg-white p-3 ${activeEventTab === "media" ? "" : "hidden"}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Media (media_assets + media_attachments)</p>
                          <button
                            type="button"
                            className="text-xs font-semibold text-neutral-700"
                            onClick={() =>
                              setJourneyEvents((prev) =>
                                prev.map((item) =>
                                  item.tempId === ev.tempId
                                    ? { ...item, media: [...item.media, createEmptyGroupEventMediaItem()] }
                                    : item,
                                ),
                              )
                            }
                          >
                            + Media
                          </button>
                        </div>
                        {ev.media.length === 0 ? (
                          <p className="text-sm text-neutral-500">Nessun media per l'evento.</p>
                        ) : (
                          ev.media.map((m, mIdx) => (
                            <div key={m.tempId} className="rounded-lg border border-neutral-200 bg-white p-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">Item {mIdx + 1}</p>
                                <button
                                  type="button"
                                  className="text-xs text-red-600"
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
                                  Elimina
                                </button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <Input
                                  label="URL pubblico"
                                  value={m.public_url}
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
                                  label="URL sorgente"
                                  value={m.source_url}
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
                              <div className="grid gap-3 md:grid-cols-3">
                                <Input
                                  label="Titolo"
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
                                />
                                <Input
                                  label="Didascalia"
                                  value={m.caption}
                                  onChange={(value) =>
                                    setJourneyEvents((prev) =>
                                      prev.map((item) => {
                                        if (item.tempId !== ev.tempId) return item;
                                        const nextMedia = [...item.media];
                                        nextMedia[mIdx] = { ...nextMedia[mIdx], caption: value };
                                        return { ...item, media: nextMedia };
                                      }),
                                    )
                                  }
                                />
                                <Input
                                  label="Alt text"
                                  value={m.alt_text}
                                  onChange={(value) =>
                                    setJourneyEvents((prev) =>
                                      prev.map((item) => {
                                        if (item.tempId !== ev.tempId) return item;
                                        const nextMedia = [...item.media];
                                        nextMedia[mIdx] = { ...nextMedia[mIdx], alt_text: value };
                                        return { ...item, media: nextMedia };
                                      }),
                                    )
                                  }
                                />
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                <Select
                                  label="Tipo"
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
                                  options={MEDIA_KIND_OPTIONS}
                                />
                                <Select
                                  label="Ruolo"
                                  value={m.role}
                                  onChange={(value) =>
                                    setJourneyEvents((prev) =>
                                      prev.map((item) => {
                                        if (item.tempId !== ev.tempId) return item;
                                        const nextMedia = [...item.media];
                                        nextMedia[mIdx] = { ...nextMedia[mIdx], role: value as any };
                                        return { ...item, media: nextMedia };
                                      }),
                                    )
                                  }
                                  options={[
                                    { value: "gallery", label: "Gallery" },
                                    { value: "attachment", label: "Attachment" },
                                    { value: "cover", label: "Cover" },
                                    { value: "document", label: "Document" },
                                    { value: "story_track", label: "Story track" },
                                  ]}
                                />
                                <Input
                                  label="Ordine"
                                  type="number"
                                  value={(m.sort_order ?? mIdx).toString()}
                                  onChange={(value) =>
                                    setJourneyEvents((prev) =>
                                      prev.map((item) => {
                                        if (item.tempId !== ev.tempId) return item;
                                        const nextMedia = [...item.media];
                                        nextMedia[mIdx] = { ...nextMedia[mIdx], sort_order: value ? Number(value) : undefined };
                                        return { ...item, media: nextMedia };
                                      }),
                                    )
                                  }
                                />
                              </div>
                            </div>
                          ))
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
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-sky-50 to-neutral-50 text-neutral-900 lg:flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-full max-w-[320px] transform bg-white/80 backdrop-blur shadow-lg transition duration-300 ease-in-out lg:static lg:translate-x-0 lg:border-r lg:border-neutral-200/80 lg:h-screen lg:overflow-y-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } h-screen overflow-y-auto`}
      >
        <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-neutral-200 bg-white/90 px-4 py-5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {JOURNEY_FILTER_OPTIONS.map((option) => {
                const isActive = journeyFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`relative px-3 py-2 text-sm font-semibold transition ${
                      isActive ? "text-sky-700" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    onClick={() => setJourneyFilter(option.value)}
                  >
                    {option.label}
                    <span
                      className={`pointer-events-none absolute inset-x-1 -bottom-1 h-[3px] rounded-full transition ${
                        isActive ? "bg-sky-600" : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <Select
              label="Ordina per"
              value={journeySort}
              onChange={(value) => setJourneySort(value as JourneySortValue)}
              options={JOURNEY_SORT_OPTIONS}
              className="w-full max-w-[220px]"
            />
            <button
              type="button"
              className="ml-auto rounded-full border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-600 shadow-sm hover:border-neutral-400 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              Chiudi
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            {filteredJourneys.length === journeys.length
              ? `${journeys.length} saved`
              : `${filteredJourneys.length} di ${journeys.length} saved (filtrato)`}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {journeysLoading ? (
            <p className="text-sm text-neutral-500">Caricamento journeys…</p>
          ) : journeysError ? (
            <p className="text-sm text-red-600">{journeysError}</p>
          ) : journeys.length === 0 ? (
            <p className="text-sm text-neutral-500">Nessun journey salvato. Crea un nuovo flow.</p>
          ) : filteredJourneys.length === 0 ? (
            <p className="text-sm text-neutral-500">Nessun journey corrisponde al filtro attivo.</p>
          ) : (
            <ul className="space-y-3">
              {filteredJourneys.map((journey) => (
                <Scorecard
                  key={journey.id}
                  title={journey.title || "(Untitled journey)"}
                  coverUrl={journey.coverUrl ?? undefined}
                  publishedAt={journey.publishedAt ?? null}
                  eventsCount={journey.eventsCount ?? null}
                  yearFrom={journey.yearFrom ?? null}
                  yearTo={journey.yearTo ?? null}
                  ctaLabel="Modifica"
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
            ? "Verifico la sessioneâ€¦"
            : profile
            ? `Profile: ${profile.id}`
            : profileError
            ? profileError
            : "Effettua il login per salvare i journeys."}
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-3 flex items-center gap-3 lg:hidden">
          <button
            type="button"
            className="rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm"
            onClick={() => setSidebarOpen(true)}
          >
            Mostra journeys
          </button>
        </div>
        <div className="mb-2" />
        <div className="space-y-4">
          {selectedJourneyId && loadingJourneyDetails && (
            <p className="text-sm text-neutral-500">Caricamento campi del journey selezionato…</p>
          )}
          {journeyDetailsError && <p className="text-sm text-red-600">{journeyDetailsError}</p>}
          {renderGroupEventPage()}
        </div>
        {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
        {saveOk && <p className="mt-2 text-sm text-green-700">?o" Creato! ID: {saveOk.id}</p>}
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
        className="w-full rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70"
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
        className="w-full min-h-[96px] rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70"
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

function MapPicker({
  lat,
  lng,
  onChange,
  className,
}: {
  lat?: number | null;
  lng?: number | null;
  onChange?: (coords: { lat: number; lng: number }) => void;
  className?: string;
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
      zoom: lat != null && lng != null ? 1.2 : 0.2,
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
  }, [lat, lng, onChange, fallbackCenter]);

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

