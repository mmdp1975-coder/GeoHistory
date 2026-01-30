
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
} from "./actions";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Scorecard } from "@/app/components/Scorecard";
import { tUI } from "@/lib/i18n/uiLabels";

type Visibility = "private" | "public";

const DEFAULT_LANGUAGE = "it";
const DEFAULT_BASE_NAME = "storia";
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
  slug?: string | null;
  code?: string | null;
  eventsCount?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  owner_profile_id?: string | null;
};

type VJourneyRow = {
  journey_id: string;
  journey_slug: string | null;
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
  sourceType?: "url" | "file";
  localFile?: File | null;
  previewUrl?: string | null;
  uploading?: boolean;
  uploadError?: string | null;
};

const MEDIA_KIND_OPTIONS: { value: MediaKind; label: string }[] = [
  { value: "image", label: "Immagine" },
  { value: "video", label: "Video" },
  { value: "other", label: "Altro" },
];

const NEW_JOURNEY_TARGET_OPTIONS = [
  "Bambini (8-11 anni)",
  "Ragazzi (12-15 anni)",
  "Studenti (16-18 anni)",
  "Pubblico generale",
  "Famiglie (lettura condivisa)",
  "Appassionati di storia",
  "Studenti universitari",
  "Storici / ricercatori",
  "Insegnanti / divulgatori",
  "Accessibilita semplificata",
];

const NEW_JOURNEY_STYLE_OPTIONS = [
  "Documentaristico coinvolgente",
  "Cronaca storica",
  "Narrativo immersivo",
  "Analitico-interpretativo",
  "Socio-culturale",
  "Politico-istituzionale",
  "Economico-commerciale",
  "Militare-strategico",
  "Urbano-territoriale",
  "Tecnologico-innovativo",
  "Crisi e collasso",
  "Transizione storica",
  "Comparativo implicito",
  "Sintetico editoriale",
  "Story-driven (light)",
];

const DEFAULT_MEDIA_ROLES = ["gallery", "cover", "poster", "context"];

const buildRoleOptions = (items: GroupEventMediaItem[]) => {
  const roles = new Set(DEFAULT_MEDIA_ROLES);
  items.forEach((item) => {
    const role = (item.role ?? "").trim();
    if (role) roles.add(role);
  });
  return Array.from(roles).map((role) => ({ value: role, label: role }));
};

type JourneyStatus = "draft" | "submitted" | "published" | "refused";

type JourneyFilterValue = "all" | Visibility;
type JourneyStatusFilterValue = "all" | JourneyStatus;

type JourneySortValue = "approved_desc" | "approved_asc";

type JourneyRating = {
  avg_rating: number | null;
  ratings_count: number | null;
};

type ImportPreview = {
  journeyRows: number;
  eventRows: number;
  sheets: string[];
};

type ImportParsedData = {
  journeyRow: Record<string, unknown> | null;
  eventRows: Record<string, unknown>[];
  eventHeaders?: string[];
  eventRowsRaw?: unknown[][];
  eventTypeIndex?: number;
};

const EXCEL_ALLOWED_EXTENSIONS = ["xlsx", "xls"];

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return hash;
};

const buildAutoSlug = (title?: string | null, description?: string | null, yearHint?: number | null) => {
  const baseSource = title?.trim() || description?.trim() || DEFAULT_BASE_NAME;
  const baseSlug = slugifyTitle(baseSource).slice(0, 60) || DEFAULT_BASE_NAME;
  const yearPart =
    formatYearForCode(yearHint) ||
    formatYearForCode(extractYearFromText(title)) ||
    formatYearForCode(extractYearFromText(description));
  const slug = yearPart ? `${baseSlug}_${yearPart}` : baseSlug;
  return slug.replace(/-+$/, "");
};

const extractYearFromText = (text?: string | null): number | null => {
  if (!text) return null;
  const match = text.match(/\b(-?\d{3,4})\b/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < -5000 || parsed > 3000) return null;
  return parsed;
};

const formatYearForCode = (year?: number | null): string | null => {
  if (year == null) return null;
  return year < 0 ? `${Math.abs(year)}bc` : `${year}`;
};

const buildAutoCode = (title?: string | null, description?: string | null, yearHint?: number | null) => {
  const base = slugifyTitle(title) || DEFAULT_BASE_NAME;
  const yearPart =
    formatYearForCode(yearHint) ||
    formatYearForCode(extractYearFromText(title)) ||
    formatYearForCode(extractYearFromText(description));
  const main = yearPart ? `${base}_${yearPart}` : base;
  // Se manca l'anno, aggiungiamo comunque una sigla breve per distinguerlo.
  if (!yearPart) {
    const hashSource = `${title || ""}|${description || ""}`;
    const hash = Math.abs(hashString(hashSource)).toString(36).toUpperCase().slice(0, 3) || "A";
    return `${main.slice(0, 12).toUpperCase()}-${hash}`;
  }
  return main.toUpperCase();
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
  import_type_raw?: string | null;
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
  sourceType: "url",
  localFile: null,
  previewUrl: null,
  uploading: false,
  uploadError: null,
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
  import_type_raw: null,
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

const isProbablyVideo = (url?: string | null, kind?: MediaKind | null) => {
  if (kind === "video") return true;
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|#|$)/i.test(url);
};

const buildAcceptFromKind = (kind?: MediaKind | null) => {
  if (kind === "video") return "video/*";
  if (kind === "image") return "image/*";
  return "image/*,video/*";
};

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
  const { profile, checking, error: profileError, personaCode } = useCurrentUser();

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
  const [journeyStatusMap, setJourneyStatusMap] = useState<Record<string, JourneyStatus>>({});
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilterValue>("all");
  const [journeyStatusFilter, setJourneyStatusFilter] = useState<JourneyStatusFilterValue>("all");
  const [journeySort, setJourneySort] = useState<JourneySortValue>("approved_asc");
  const [journeySearchTerm, setJourneySearchTerm] = useState<string>("");
  const [journeyRatingMap, setJourneyRatingMap] = useState<Record<string, JourneyRating>>({});
  const [activeTab, setActiveTab] = useState<"group" | "events">("group");
  const [journeySubTab, setJourneySubTab] = useState<"general" | "translations" | "media">("general");
  const [availableEventTypes, setAvailableEventTypes] = useState<{ id: string; label: string; aliases: string[] }[]>([]);
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarFiltersOpen, setSidebarFiltersOpen] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteOk, setDeleteOk] = useState<string | null>(null);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalOk, setApprovalOk] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importParsed, setImportParsed] = useState<ImportParsedData>({
    journeyRow: null,
    eventRows: [],
    eventHeaders: [],
    eventRowsRaw: [],
    eventTypeIndex: -1,
  });
  const [importAppliedMessage, setImportAppliedMessage] = useState<string | null>(null);
  const [importActiveLang, setImportActiveLang] = useState<string>(DEFAULT_LANGUAGE);
  const [newJourneyOpen, setNewJourneyOpen] = useState(false);
  const [newJourneyTitle, setNewJourneyTitle] = useState("");
  const [newJourneyAudience, setNewJourneyAudience] = useState("Appassionati di storia");
  const [newJourneyStyle, setNewJourneyStyle] = useState("Narrativo immersivo");
  const [newJourneyRunning, setNewJourneyRunning] = useState(false);
  const [newJourneyJobId, setNewJourneyJobId] = useState<string | null>(null);
  const [newJourneyError, setNewJourneyError] = useState<string | null>(null);
  const [newJourneyResult, setNewJourneyResult] = useState<{ message: string; filePath?: string | null } | null>(null);
  const [newJourneyStage, setNewJourneyStage] = useState<
    "idle" | "prompt_1" | "prompt_2" | "prompt_3" | "json" | "done"
  >("idle");
  const [newJourneyCompletedStep, setNewJourneyCompletedStep] = useState<number>(0);
  const [newJourneySummary, setNewJourneySummary] = useState<string>("");
  const [newJourneyElapsed, setNewJourneyElapsed] = useState(0);
  const [newJourneyTotalElapsed, setNewJourneyTotalElapsed] = useState(0);
  const [newJourneyStepDurations, setNewJourneyStepDurations] = useState<Record<string, number>>({});
  const [newJourneyLogOpen, setNewJourneyLogOpen] = useState(false);
  const [newJourneyLog, setNewJourneyLog] = useState("");
  const [newJourneyPendingPayload, setNewJourneyPendingPayload] = useState<any | null>(null);
  const [newJourneyCopyMessage, setNewJourneyCopyMessage] = useState<string | null>(null);
  const newJourneyPollRef = useRef<number | null>(null);
  const newJourneyTokenRef = useRef<string | null>(null);
  const newJourneyRefreshRef = useRef<number | null>(null);
  const newJourneyStepRef = useRef<"1" | "2" | "3" | null>(null);
  const newJourneyTimerRef = useRef<number | null>(null);
  const newJourneyTotalTimerRef = useRef<number | null>(null);
  const newJourneyTotalStartRef = useRef<number | null>(null);
  const newJourneyStepStartRef = useRef<number | null>(null);
  const newJourneyTotalAccumRef = useRef<number>(0);
  const newJourneyCanRun = !!newJourneyTitle.trim() && !!newJourneyAudience && !!newJourneyStyle && !newJourneyRunning;
  const lastAutoSlugRef = useRef<string>("");
  const lastAutoCodeRef = useRef<string>("");
  const isAdminProfile = personaCode.startsWith("ADMIN");
  const isItalian = (langCode || "").toLowerCase().startsWith("it");
  const bestTitleForAuto = useMemo(() => {
    const preferred =
      translation.title?.trim() ||
      translations.find((tr) => tr.lang === selectedTranslationLang && tr.title?.trim())?.title?.trim() ||
      translations.find((tr) => tr.lang === "it" && tr.title?.trim())?.title?.trim() ||
      translations.find((tr) => tr.lang === "en" && tr.title?.trim())?.title?.trim() ||
      translations.find((tr) => tr.title?.trim())?.title?.trim() ||
      "";
    return preferred;
  }, [translation.title, translations, selectedTranslationLang]);
  const journeyYearHint = useMemo(() => {
    const years: number[] = [];
    journeyEvents.forEach((ev) => {
      const yFrom = normalizeYearForEra(ev.event.year_from, ev.event.era);
      const yTo = normalizeYearForEra(ev.event.year_to, ev.event.era);
      if (yFrom != null) {
        years.push(yFrom);
      } else if (yTo != null) {
        years.push(yTo);
      }
    });
    if (!years.length) return null;
    years.sort((a, b) => a - b);
    return years[0];
  }, [journeyEvents]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSidebarOpen(window.innerWidth >= 1024);
  }, []);
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

  const mediaRoleOptions = useMemo(
    () => buildRoleOptions([...groupEventMedia, ...journeyEvents.flatMap((ev) => ev.media || [])]),
    [groupEventMedia, journeyEvents],
  );

  const journeyFilterOptions = useMemo(
    () => [
      { value: "all" as JourneyFilterValue, label: tUI(langCode, "build.sidebar.filter.all") },
      { value: "public" as JourneyFilterValue, label: tUI(langCode, "build.sidebar.filter.public") },
      { value: "private" as JourneyFilterValue, label: tUI(langCode, "build.sidebar.filter.private") },
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
    const searchText = journeySearchTerm.trim().toLowerCase();
    const matchesSearch = (journey: JourneySummary) => {
      if (!searchText) return true;
      const parts = [
        journey.title ?? "",
        journey.id ?? "",
        journey.owner_profile_id ?? "",
        journey.yearFrom != null ? `${journey.yearFrom}` : "",
        journey.yearTo != null ? `${journey.yearTo}` : "",
      ];
      return parts.some((part) => part.toLowerCase().includes(searchText));
    };
    if (journeyFilter === "all") {
      const byStatus =
        journeyStatusFilter === "all"
        ? journeys
        : journeys.filter((journey) => journeyStatusMap[journey.id] === journeyStatusFilter);
      return byStatus.filter(matchesSearch);
    }
    const byVisibility = journeys.filter((journey) => journeyVisibilityMap[journey.id] === journeyFilter);
    if (journeyStatusFilter === "all") {
      return byVisibility.filter(matchesSearch);
    }
    return byVisibility.filter((journey) => journeyStatusMap[journey.id] === journeyStatusFilter).filter(matchesSearch);
  }, [journeyFilter, journeyStatusFilter, journeyVisibilityMap, journeyStatusMap, journeys, journeySearchTerm]);
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

  const uploadMediaFile = useCallback(
    async ({
      file,
      role,
      entityId,
      kind,
    }: {
      file: File;
      role?: string | null;
      entityId?: string | null;
      kind?: MediaKind | null;
    }) => {
      const form = new FormData();
      form.append("file", file);
      if (role) form.append("role", role);
      if (kind) form.append("kind", kind);
      if (entityId) form.append("entityId", entityId);

      const res = await fetch("/api/upload-media", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || res.statusText || "Upload failed");
      }
      const data = (await res.json()) as { publicUrl: string; bucket: string; path: string };
      return {
        publicUrl: data.publicUrl,
        storagePath: data.path,
        bucket: data.bucket,
        kind: kind ?? "image",
      };
    },
    [],
  );

  const buildEventsPayload = useCallback(
    async (group_event_id: string): Promise<{ events: JourneyEventEditPayload[]; delete_event_ids: string[] }> => {
      const events: JourneyEventEditPayload[] = [];
      for (let evIdx = 0; evIdx < journeyEvents.length; evIdx++) {
        const ev = journeyEvents[evIdx];
        const typeCodes =
          ev.type_codes && ev.type_codes.length
            ? ev.type_codes
            : ev.event.event_types_id
            ? [ev.event.event_types_id]
            : ev.import_type_raw
            ? [ev.import_type_raw]
            : [];

        const media: GroupEventMediaEntry[] = [];
        for (let mIdx = 0; mIdx < ev.media.length; mIdx++) {
          const m = ev.media[mIdx] as GroupEventMediaItem;
          const role = (m.role || "gallery").trim();
          const kind = m.kind || "image";
          const sourceType = m.sourceType || (m.localFile ? "file" : "url");

          if (role === "cover" && kind !== "image") {
            throw new Error(isItalian ? "Le cover devono essere immagini." : "Cover must be an image.");
          }

          let public_url = (m.public_url || "").trim();
          let source_url = (m.source_url || "").trim();

          if (sourceType === "file" && m.localFile) {
            const uploaded = await uploadMediaFile({
              file: m.localFile,
              role,
              entityId: ev.event_id || group_event_id || ev.tempId,
              kind,
            });
            public_url = uploaded.publicUrl;
            source_url = source_url || uploaded.publicUrl;
          }

          if (!public_url && !source_url) {
            continue;
          }

          media.push({
            public_url: public_url || undefined,
            source_url: source_url || public_url || undefined,
            title: m.title?.trim() || undefined,
            caption: m.caption?.trim() || undefined,
            alt_text: m.alt_text?.trim() || undefined,
            role,
            sort_order: m.sort_order ?? mIdx,
            is_primary: m.is_primary,
            kind,
          });
        }

        const translationsPayload = (() => {
          const raw = (ev.translations_all && ev.translations_all.length ? ev.translations_all : [ev.translation]) || [];
          const map = new Map<string, {
            lang: string;
            title?: string;
            description_short?: string;
            description?: string;
            wikipedia_url?: string;
            video_url?: string;
          }>();
          raw.forEach((tr) => {
            const lang = (tr?.lang || DEFAULT_LANGUAGE).trim() || DEFAULT_LANGUAGE;
            map.set(lang, {
              ...tr,
              lang,
              title: tr?.title ?? "",
              description: tr?.description ?? "",
              description_short: tr?.description_short ?? tr?.description ?? "",
              wikipedia_url: tr?.wikipedia_url ?? "",
              video_url: tr?.video_url ?? undefined,
            });
          });
          return Array.from(map.values());
        })();
        const activeTranslation =
          translationsPayload.find((tr) => tr.lang === ev.activeLang) ||
          translationsPayload[0] || {
            lang: ev.activeLang || DEFAULT_LANGUAGE,
            title: "",
            description_short: "",
            description: "",
            wikipedia_url: "",
            video_url: undefined,
          };

        events.push({
          event_id: ev.event_id,
          added_by_user_ref: ev.added_by_user_ref ?? null,
          event: { ...ev.event },
          translation: { ...activeTranslation },
          translations: translationsPayload,
          type_codes: typeCodes.map((code) => code?.trim()).filter(Boolean),
          correlations: ev.correlations
            .map((c) => ({
              group_event_id: c.group_event_id?.trim() || "",
              correlation_type: c.correlation_type || "related",
            }))
            .filter((c) => c.group_event_id),
          media,
        });
      }
      return { events, delete_event_ids: deletedEventIds };
    },
    [deletedEventIds, isItalian, journeyEvents, uploadMediaFile],
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
    const autoSlug = buildAutoSlug(bestTitleForAuto, ge.description, journeyYearHint);
    const autoCode = buildAutoCode(bestTitleForAuto, ge.description, journeyYearHint);

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
  }, [bestTitleForAuto, ge.description, journeyYearHint]);

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
      const { data: typeRows } = await supabase.from("event_types").select("*");
      if (typeRows) {
        const codes = Array.from(
          new Map(
            typeRows
              .map((row: any) => {
                const id = row?.id ? String(row.id).trim() : "";
                if (!id) return null;
                const labelRaw =
                  row?.label ??
                  row?.name ??
                  row?.title ??
                  row?.code ??
                  row?.slug ??
                  id;
                const label = String(labelRaw ?? id).trim() || id;
                const aliasValues = [
                  row?.code,
                  row?.slug,
                  row?.name,
                  row?.label,
                  row?.title,
                  row?.type,
                  row?.type_code,
                  row?.event_type,
                  row?.event_code,
                  id,
                ]
                  .map((val) => (val == null ? "" : String(val).trim()))
                  .filter(Boolean)
                  .map((val) => val.toLowerCase());
                const aliases = Array.from(new Set(aliasValues));
                return [id, { id, label, aliases }] as const;
              })
              .filter((entry): entry is [string, { id: string; label: string; aliases: string[] }] => Boolean(entry)),
          ).entries(),
        ).map(([, value]) => value);
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
        setJourneyStatusMap({});
        return;
      }
      const { data: rows, error } = await supabase
        .from("v_journeys")
        .select("journey_id,translation_title,approved_at,events_count,year_from_min,year_to_max")
        .in("journey_id", ownerIds)
        .order("approved_at", { ascending: journeySort === "approved_asc" });
      if (error) throw error;
      const journeysFromView = (rows ?? []) as VJourneyRow[];

      const { data: coverRows, error: coverError } = await supabase
        .from("v_media_attachments_expanded")
        .select("group_event_id,public_url,is_primary,sort_order")
        .in("group_event_id", ownerIds)
        .eq("entity_type", "group_event")
        .eq("role", "cover")
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true });
      if (coverError) throw coverError;
      const coverMap: Record<string, string | undefined> = {};
      (coverRows ?? []).forEach((row: any) => {
        const groupId = row.group_event_id as string | undefined;
        if (!groupId) return;
        if (coverMap[groupId]) return;
        if (row.public_url) coverMap[groupId] = row.public_url as string;
      });
      const journeyIds = journeysFromView.map((journey) => journey.journey_id);
      const { data: visibilityRows, error: visibilityError } = await supabase
        .from("group_events")
        .select("id,visibility,workflow_state,slug,code")
        .in("id", ownerIds);
      if (visibilityError) throw visibilityError;
      const visibilityMap: Record<string, Visibility> = {};
      const statusMap: Record<string, JourneyStatus> = {};
      const slugMap: Record<string, string | null> = {};
      const codeMap: Record<string, string | null> = {};
      (visibilityRows ?? []).forEach((row) => {
        if (row.id && (row.visibility === "private" || row.visibility === "public")) {
          visibilityMap[row.id] = row.visibility as Visibility;
        }
        if (row.id) {
          const st = (row as any).workflow_state as string | null;
          const normalized = st && typeof st === "string" ? st.toLowerCase() : null;
          const allowed: JourneyStatus[] = ["draft", "submitted", "published", "refused"];
          statusMap[row.id] = allowed.includes(normalized as JourneyStatus)
            ? (normalized as JourneyStatus)
            : "draft";
          slugMap[row.id] = typeof row.slug === "string" ? row.slug : null;
          codeMap[row.id] = typeof row.code === "string" ? row.code : null;
        }
      });
      setJourneyVisibilityMap(visibilityMap);
      setJourneyStatusMap(statusMap);
      setJourneys(
        journeysFromView.map((journey) => ({
          id: journey.journey_id,
          title: journey.translation_title ?? null,
          coverUrl: coverMap[journey.journey_id] ?? null,
          publishedAt: journey.approved_at,
          slug: slugMap[journey.journey_id] ?? null,
          code: codeMap[journey.journey_id] ?? null,
          eventsCount: journey.events_count,
          yearFrom: journey.year_from_min,
          yearTo: journey.year_to_max,
          owner_profile_id: profile.id,
        }))
      );

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
          return Array.from(next.entries()).map(([id, label]) => ({
            id,
            label,
            aliases: [id, label].map((value) => value.toLowerCase()),
          }));
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

  const handleGroupMediaFileChange = useCallback((index: number, file: File | null) => {
    if (!file) return;
    setGroupEventMedia((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              localFile: file,
              sourceType: "file",
              public_url: "",
              source_url: "",
              previewUrl: URL.createObjectURL(file),
              uploadError: null,
            }
          : item,
      ),
    );
  }, []);

  const previewUrlFromMedia = useCallback((m: GroupEventMediaItem | GroupEventMediaEntry & { previewUrl?: string | null }) => {
    return m.previewUrl || m.public_url || (m as any).source_url || "";
  }, []);

  const handleEventMediaFileChange = useCallback((tempId: string, mediaIndex: number, file: File | null) => {
    if (!file) return;
    setJourneyEvents((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        const nextMedia = [...item.media];
        if (!nextMedia[mediaIndex]) return item;
        nextMedia[mediaIndex] = {
          ...nextMedia[mediaIndex],
          localFile: file,
          sourceType: "file",
          public_url: "",
          source_url: "",
          previewUrl: URL.createObjectURL(file),
          uploadError: null,
        } as any;
        return { ...item, media: nextMedia };
      }),
    );
  }, []);

  const prepareGroupMediaForSave = useCallback(
    async (groupId: string | null) => {
      let coverUrl = ge.cover_url?.trim() || "";
      const processed: GroupEventMediaEntry[] = [];
      for (let i = 0; i < groupEventMedia.length; i++) {
        const item = groupEventMedia[i];
        const role = (item.role || "gallery").trim();
        const kind = item.kind || "image";
        const sourceType = item.sourceType || (item.localFile ? "file" : "url");

        if (role === "cover" && kind !== "image") {
          throw new Error(isItalian ? "La cover deve essere un'immagine." : "Cover must be an image.");
        }

        let publicUrl = (item.public_url || "").trim();
        let sourceUrl = (item.source_url || "").trim();

        if (sourceType === "file" && item.localFile) {
          const uploaded = await uploadMediaFile({ file: item.localFile, role, entityId: groupId, kind });
          publicUrl = uploaded.publicUrl;
          sourceUrl = sourceUrl || uploaded.publicUrl;
        }

        if (!publicUrl && !sourceUrl) {
          continue;
        }

        const payload: GroupEventMediaEntry = {
          public_url: publicUrl || undefined,
          source_url: sourceUrl || publicUrl || undefined,
          title: item.title?.trim() || undefined,
          caption: item.caption?.trim() || undefined,
          alt_text: item.alt_text?.trim() || undefined,
          role,
          sort_order: item.sort_order ?? i,
          is_primary: !!item.is_primary,
          kind,
        };
        processed.push(payload);
        if (role === "cover" && publicUrl) {
          coverUrl = publicUrl;
        }
      }
      return { coverUrl, media: processed };
    },
    [ge.cover_url, groupEventMedia, isItalian, uploadMediaFile],
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
    let preparedGroupMedia: { coverUrl: string; media: GroupEventMediaEntry[] } = { coverUrl: ge.cover_url || "", media: [] };
    try {
      preparedGroupMedia = await prepareGroupMediaForSave(selectedJourneyId);
    } catch (err: any) {
      setSaveError(err?.message || tUI(langCode, "build.messages.save_error"));
      setSaving(false);
      return;
    }

    const normalizedSlugInput = (ge.slug || "").trim();
    const normalizedCodeInput = (ge.code || "").trim();
    let resolvedSlug =
      (normalizedSlugInput ? slugifyTitle(normalizedSlugInput).slice(0, 60) : "") ||
      buildAutoSlug(bestTitleForAuto, ge.description, journeyYearHint);
    let resolvedCode =
      (normalizedCodeInput ? normalizedCodeInput.toUpperCase() : "") ||
      buildAutoCode(bestTitleForAuto, ge.description, journeyYearHint);
    if (!selectedJourneyId) {
      const slugClash = journeys.some((j) => (j.slug || "") === resolvedSlug);
      const codeClash = journeys.some((j) => (j.code || "") === resolvedCode);
      if (slugClash) resolvedSlug = `${resolvedSlug}-${Math.random().toString(36).slice(2, 5)}`;
      if (codeClash) resolvedCode = `${resolvedCode}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      try {
        const { data: dupSlugRow } = await supabase
          .from("group_events")
          .select("id")
          .eq("slug", resolvedSlug)
          .maybeSingle();
        if (dupSlugRow) {
          resolvedSlug = `${resolvedSlug}-${Math.random().toString(36).slice(2, 5)}`;
        }
      } catch {
        // ignore slug check errors
      }
      try {
        const { data: dupCodeRow } = await supabase
          .from("group_events")
          .select("id")
          .eq("code", resolvedCode)
          .maybeSingle();
        if (dupCodeRow) {
          resolvedCode = `${resolvedCode}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        }
      } catch {
        // ignore code check errors
      }
      if (resolvedSlug !== ge.slug || resolvedCode !== ge.code) {
        setGe((prev) => ({ ...prev, slug: resolvedSlug, code: resolvedCode }));
      }
    }

    const basePayload: SaveJourneyPayload = {
      group_event_id: selectedJourneyId ?? undefined,
      group_event: {
        cover_url: preparedGroupMedia.coverUrl || undefined,
        visibility: ge.visibility,
        description: ge.description || undefined,
        language: ge.language || DEFAULT_LANGUAGE,
        slug: resolvedSlug || undefined,
        code: resolvedCode || undefined,
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
      group_event_media: preparedGroupMedia.media,
      events: [],
    };

    let attempt = 0;
    let completed = false;
    // Manteniamo una copia mutabile per retry nello stesso tick (setState e' async)
    let retryGe = { ...ge, slug: resolvedSlug, code: resolvedCode };
    while (attempt < 2 && !completed) {
      try {
        const payload: SaveJourneyPayload = {
          ...basePayload,
          group_event: {
            ...basePayload.group_event,
            slug: retryGe.slug || basePayload.group_event.slug,
            code: retryGe.code || basePayload.group_event.code,
          },
        };

        const res = await saveJourney(payload);
        const groupId = res.group_event_id;
        setSelectedJourneyId(groupId);

        let eventsError: any = null;
        const { events, delete_event_ids } = await buildEventsPayload(groupId);
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
        completed = true;
      } catch (err: any) {
        const errText = typeof err === "string" ? err : err?.message || "";
        const errMsg = errText || tUI(langCode, "build.messages.save_error");
        const dupCode = errText.includes("group_events_code_key");
        const dupSlug = errText.includes("group_events_slug_key");
        if (attempt === 0 && (dupCode || dupSlug)) {
          let bumpedGe = { ...retryGe };
          if (dupCode) {
            const baseCode = buildAutoCode(bestTitleForAuto, retryGe.description ?? ge.description, journeyYearHint)
              .replace(/-+$/, "")
              .replace(/--+/g, "-");
            const bumped = `${baseCode}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
            bumpedGe = { ...bumpedGe, code: bumped };
          }
          if (dupSlug) {
            const baseSlug =
              (retryGe.slug ||
                ge.slug ||
                buildAutoSlug(bestTitleForAuto, ge.description, journeyYearHint) ||
                DEFAULT_BASE_NAME)
              .replace(/-+$/, "")
              .replace(/--+/g, "-");
            const bumped = `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`;
            bumpedGe = { ...bumpedGe, slug: bumped };
          }
          retryGe = bumpedGe;
          setGe(bumpedGe); // aggiorna UI, ma il retry usa subito retryGe
          attempt += 1;
          continue; // retry automatically once
        }
        setSaveError(errMsg);
        setEventsSaveError((prev) => prev || errMsg);
        completed = true;
      }
    }
    setSaving(false);
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

  const resetImportState = useCallback(() => {
    setImportFile(null);
    setImportError(null);
    setImportPreview(null);
    setImportLoading(false);
    setImportParsed({ journeyRow: null, eventRows: [], eventHeaders: [], eventRowsRaw: [], eventTypeIndex: -1 });
    setImportAppliedMessage(null);
    setImportActiveLang(DEFAULT_LANGUAGE);
  }, []);

  const handleImportFileChange = useCallback(
    (fileList: FileList | null) => {
      const nextFile = fileList?.item(0) ?? null;
      setImportPreview(null);

      if (!nextFile) {
        setImportFile(null);
        setImportError(null);
        return;
      }

      const ext = (nextFile.name.split(".").pop() || "").toLowerCase();
      if (!EXCEL_ALLOWED_EXTENSIONS.includes(ext)) {
        setImportFile(null);
        setImportError(tUI(langCode, "build.import.error.invalid_type"));
        return;
      }

      setImportFile(nextFile);
      setImportError(null);
    },
    [langCode],
  );

  const handleImportDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const files = event.dataTransfer?.files ?? null;
      if (files?.length) {
        handleImportFileChange(files);
      }
    },
    [handleImportFileChange],
  );

  const parseImportFile = useCallback(async (file: File) => {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const normalizedSheets = workbook.SheetNames.map((name) => name.trim().toLowerCase());
    const journeySheetIndex = normalizedSheets.indexOf("journey");
    const eventsSheetIndex = normalizedSheets.indexOf("events");

    if (journeySheetIndex === -1 || eventsSheetIndex === -1) {
      throw new Error("missing_sheets");
    }

    const journeySheetName = workbook.SheetNames[journeySheetIndex];
    const eventsSheetName = workbook.SheetNames[eventsSheetIndex];
    const journeyRows = XLSX.utils.sheet_to_json(workbook.Sheets[journeySheetName], { defval: "" }) as Record<
      string,
      unknown
    >[];
    const eventsSheet = workbook.Sheets[eventsSheetName];
    const eventRowsAoA = XLSX.utils.sheet_to_json(eventsSheet, { defval: "", header: 1 }) as unknown[][];
    const [eventHeaderRow, ...eventDataRows] = eventRowsAoA;
    const eventHeaders = (eventHeaderRow || []).map((cell) => (cell == null ? "" : String(cell).trim()));
    const normalizeHeader = (header: string) =>
      header
        .replace(/\u00a0/g, " ")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const eventTypeHeaderIndex = eventHeaders.findIndex((header) => {
      const key = normalizeHeader(header);
      return (key.includes("type") && key.includes("event")) || (key.includes("tipo") && key.includes("evento"));
    });
    const eventRows = eventDataRows.map((row) => {
      const record: Record<string, unknown> = {};
      eventHeaders.forEach((header, idx) => {
        if (!header) return;
        record[header] = row?.[idx] ?? "";
      });
      if (eventTypeHeaderIndex >= 0) {
        record.__event_type_value__ = row?.[eventTypeHeaderIndex] ?? "";
      }
      return record;
    });

    return {
      preview: {
        journeyRows: journeyRows.length,
        eventRows: eventRows.length,
        sheets: workbook.SheetNames,
      },
      parsed: {
        journeyRow: journeyRows[0] ?? null,
        eventRows,
        eventHeaders,
        eventRowsRaw: eventDataRows,
        eventTypeIndex: eventTypeHeaderIndex,
      },
    };
  }, []);

  const handleValidateImportFile = useCallback(async () => {
    if (!importFile) {
      setImportError(tUI(langCode, "build.import.error.missing_file"));
      return;
    }

    const ext = (importFile.name.split(".").pop() || "").toLowerCase();
    if (!EXCEL_ALLOWED_EXTENSIONS.includes(ext)) {
      setImportError(tUI(langCode, "build.import.error.invalid_type"));
      return;
    }

    try {
      setImportLoading(true);
      const { preview, parsed } = await parseImportFile(importFile);
      setImportPreview(preview);
      setImportError(null);
      setImportParsed(parsed);
      setImportAppliedMessage(null);
    } catch (err: any) {
      const message =
        err?.message === "missing_sheets"
          ? tUI(langCode, "build.import.error.missing_sheets")
          : tUI(langCode, "build.import.error.generic");
      console.error("[BuildJourney] Excel import error:", err);
      setImportError(message);
      setImportPreview(null);
      setImportParsed({ journeyRow: null, eventRows: [], eventHeaders: [], eventRowsRaw: [], eventTypeIndex: -1 });
    } finally {
      setImportLoading(false);
    }
  }, [importFile, langCode, parseImportFile]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      setImportError(null);
      const XLSX = await import("xlsx");
      const journeyHeaders = ["Titolo IT", "Descrizione IT", "Title EN", "Description EN"];
      const eventsHeaders = [
        "Journey IT",
        "Journey EN",
        "Era (AD|BC)",
        "From (year)",
        "To (year)",
        "Event date (DD/MM/YYYY)",
        "Continent",
        "Country",
        "Location",
        "Lat (text, dot decimal)",
        "Lon (text, dot decimal)",
        "Titolo evento IT",
        "wikipedia URL evento IT",
        "Descrizione evento IT",
        "Title event EN",
        "wikipedia URL event EN",
        "Description event EN",
        "Type event",
        "Journey approfondimento 1",
        "Journey approfondimento 2",
        "Journey approfondimento 3",
      ];
      const journeySheet = XLSX.utils.aoa_to_sheet([journeyHeaders]);
      const eventsSheet = XLSX.utils.aoa_to_sheet([eventsHeaders]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, journeySheet, "Journey");
      XLSX.utils.book_append_sheet(workbook, eventsSheet, "Events");
      XLSX.writeFile(workbook, "journey_import_template.xlsx");
    } catch (err: any) {
      console.error("[BuildJourney] template download error:", err?.message || err);
      setImportError(tUI(langCode, "build.import.error.generic"));
    }
  }, [langCode]);


  const applyParsedImport = (parsed: ImportParsedData) => {
    const normalizeKey = (key: string) =>
      key
        .replace(/\u00a0/g, " ")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const normalizeValue = (value: unknown) =>
      value == null ? "" : String(value).replace(/\u00a0/g, " ").trim();
    const parseNumber = (value: unknown): number | null => {
      if (value == null) return null;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      const str = String(value).trim().replace(/\s+/g, "").replace(/,/g, ".");
      if (!str) return null;
      let num = parseFloat(str);
      if (!Number.isFinite(num)) return null;
      // Heuristic: if no decimal separator in input and the value is clearly out of coordinate range, scale down.
      if (!str.includes(".") && Math.abs(num) > 180) {
        let scaled = num;
        let factor = 0;
        while (Math.abs(scaled) > 180 && factor < 6) {
          scaled = scaled / 10;
          factor += 1;
        }
        num = scaled;
      }
      return num;
    };
    const parseExactDate = (value: unknown): string | null => {
      if (value == null) return null;
      if (typeof value === "number" && Number.isFinite(value)) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const ms = value * 86400 * 1000;
        const parsed = new Date(excelEpoch + ms);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      }
      const str = normalizeValue(value);
      if (!str) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
      const match = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      if (match) {
        const day = match[1].padStart(2, "0");
        const month = match[2].padStart(2, "0");
        const year = match[3];
        return `${year}-${month}-${day}`;
      }
      return null;
    };
    const extract = (row: Record<string, unknown>, candidates: string[]): unknown => {
      const lowered = Object.fromEntries(
        Object.entries(row || {}).map(([k, v]) => [normalizeKey(k), v]),
      );
      for (const key of candidates) {
        const value = lowered[normalizeKey(key)];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return value;
        }
      }
      return null;
    };
    const extractEventType = (row: Record<string, unknown>, candidates: string[]): unknown => {
      const explicitColumn = row.__event_type_value__;
      if (explicitColumn !== undefined && explicitColumn !== null && String(explicitColumn).trim() !== "") {
        return explicitColumn;
      }
      const aggressiveKeyMatch = Object.entries(row || {}).find(([rawKey, rawVal]) => {
        const signature = String(rawKey || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const isTypeEvent = signature.includes("typeevent") || signature.includes("tipoevento");
        if (!isTypeEvent) return false;
        return rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
      });
      if (aggressiveKeyMatch) {
        return aggressiveKeyMatch[1];
      }
      const direct = extract(row, candidates);
      if (direct !== null && direct !== undefined && String(direct).trim() !== "") {
        return direct;
      }
      for (const [rawKey, rawVal] of Object.entries(row || {})) {
        const key = normalizeKey(rawKey);
        if (!key) continue;
        const hasTypeEvent = key.includes("type") && key.includes("event");
        const hasTipoEvento = key.includes("tipo") && key.includes("evento");
        if (hasTypeEvent || hasTipoEvento) {
          if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "") {
            return rawVal;
          }
        }
      }
      return null;
    };
    const guessEventTypeValue = (row: Record<string, unknown>, candidates: string[]): string => {
      const explicit = normalizeValue(extractEventType(row, candidates) || "");
      if (explicit) return explicit;
      const values = Object.values(row || {})
        .map((val) => normalizeValue(val))
        .filter(Boolean);
      if (availableEventTypes.length) {
        for (const val of values) {
          const normalized = val.toLowerCase();
          const match = availableEventTypes.find(
            (opt) =>
              opt.id.toLowerCase() === normalized ||
              opt.label.toLowerCase() === normalized ||
              opt.aliases.includes(normalized),
          );
          if (match) return val;
        }
      }
      const codeCandidate = values.find((val) => /^[a-z0-9_]+$/i.test(val) && val.includes("_"));
      return codeCandidate || "";
    };

    // accept both EN/IT headings from the workbook
    const journeyTitleKeys = ["title", "name", "titolo"];
    const journeyDescriptionKeys = ["description", "summary", "descrizione"];
    const journeyLangKeys = ["language", "lang", "locale", "lingua"];
    const journeyVisibilityKeys = ["visibility", "public", "visibilita", "visibilità"];
    const journeyCoverKeys = ["cover", "cover_url", "image", "coverurl", "copertina"];

    const eventTitleKeys = ["title", "name", "titolo"];
    const eventDescShortKeys = ["description_short", "summary", "descrizione_breve"];
    const eventDescKeys = ["description", "details", "descrizione"];
    const eventEraKeys = ["era", "periodo", "era (ad|bc)", "era ad/bc", "era ad bc"];
    const eventYearFromKeys = ["year_from", "from", "from (year)", "start_year", "anno_da", "inizio"];
    const eventYearToKeys = ["year_to", "to", "to (year)", "end_year", "anno_a", "fine"];
    const eventExactDateKeys = ["exact_date", "date", "data", "event date", "event date (dd/mm/yyyy)", "data evento"];
    const eventContinentKeys = ["continent", "continente"];
    const eventCountryKeys = ["country", "paese", "nazione"];
    const eventLocationKeys = ["location", "place", "city", "luogo", "citta", "città"];
    const eventLatKeys = ["latitude", "lat", "lat (text, dot decimal)", "latitudine"];
    const eventLngKeys = ["longitude", "lon", "lng", "lon (text, dot decimal)", "longitudine"];
    const eventImageKeys = ["image", "image_url", "immagine"];
    const eventTypeKeys = [
      "event_type_id",
      "event_types_id",
      "tipo_evento",
      "type",
      "type_event",
      "type event",
      "type_events",
      "type events",
    ];
    const eventWikipediaKeys = ["wikipedia", "wikipedia_url"];
    const importYearHint = (() => {
      const years: number[] = [];
      (parsed.eventRows || []).forEach((row) => {
        const yFrom = parseNumber(extract(row as Record<string, unknown>, eventYearFromKeys));
        const yTo = parseNumber(extract(row as Record<string, unknown>, eventYearToKeys));
        if (yFrom != null) {
          years.push(yFrom);
        } else if (yTo != null) {
          years.push(yTo);
        }
      });
      if (!years.length) return null;
      years.sort((a, b) => a - b);
      return years[0];
    })();


    const buildTranslationsFromJourneyRow = (
      row: Record<string, unknown>,
    ): { lang: string; title?: string; description?: string }[] => {
      const entries: Record<string, { lang: string; title?: string; description?: string }> = {};
      Object.entries(row || {}).forEach(([rawKey, rawVal]) => {
        const key = normalizeKey(rawKey);
        const value = normalizeValue(rawVal);
        if (!value) return;
        // Detect language suffix e.g. "titolo it", "title en"
        const match = key.match(/(titolo|title|descrizione|description)[_\s-]*([a-z]{2})?$/i);
        if (!match) return;
        const kind = match[1];
        const lang = (match[2] || "").toLowerCase() || translationLang;
        const bucket = entries[lang] || { lang };
        if (kind.startsWith("titolo") || kind.startsWith("title")) {
          bucket.title = value;
        } else if (kind.startsWith("descrizione") || kind.startsWith("description")) {
          bucket.description = value;
        }
        entries[lang] = bucket;
      });
      return Object.values(entries).filter((t) => t.title || t.description);
    };

    const buildEventTranslationsFromRow = (
      row: Record<string, unknown>,
      fallbackLang: string,
    ): {
      lang: string;
      title?: string;
      description?: string;
      description_short?: string;
      wikipedia_url?: string;
    }[] => {
      const entries: Record<string, { lang: string; title?: string; description?: string; description_short?: string; wikipedia_url?: string }> = {};
      Object.entries(row || {}).forEach(([rawKey, rawVal]) => {
        const value = normalizeValue(rawVal);
        if (!value) return;
        const tokens = normalizeKey(rawKey)
          .split(/[\s_-]+/)
          .filter(Boolean);
        if (!tokens.length) return;
        const langToken = tokens[tokens.length - 1];
        const lang = langToken.length === 2 ? langToken : fallbackLang;
        const kindToken = tokens.find((t) => ["titolo", "title", "descrizione", "description", "wikipedia"].includes(t));
        if (!kindToken) return;
        const bucket = entries[lang] || { lang };
        if (kindToken === "titolo" || kindToken === "title") {
          bucket.title = value;
        } else if (kindToken === "descrizione" || kindToken === "description") {
          bucket.description = value;
          bucket.description_short = bucket.description_short || value;
        } else if (kindToken === "wikipedia") {
          bucket.wikipedia_url = value;
        }
        entries[lang] = bucket;
      });
      return Object.values(entries).filter((t) => t.title || t.description || t.wikipedia_url);
    };

    const journeyRow = parsed.journeyRow ?? {};
    const journeyTitle = normalizeValue(extract(journeyRow, journeyTitleKeys) || "");
    const journeyDescription = normalizeValue(extract(journeyRow, journeyDescriptionKeys) || "");
    const journeyLang = normalizeValue(extract(journeyRow, journeyLangKeys) || "") || DEFAULT_LANGUAGE;
    const journeyVisibility = normalizeValue(extract(journeyRow, journeyVisibilityKeys) || "").toLowerCase();
    const visibility: Visibility =
      journeyVisibility === "public" || journeyVisibility === "pubblic"
        ? "public"
        : journeyVisibility === "private"
        ? "private"
        : ge.visibility;
    const translationLang = journeyLang || DEFAULT_LANGUAGE;
    const sheetTranslations = buildTranslationsFromJourneyRow(journeyRow);
    const translationsToUse =
      sheetTranslations.length > 0
        ? sheetTranslations
        : [{ lang: translationLang, title: journeyTitle, description: journeyDescription }];

    const primary = translationsToUse[0];
    setTranslation({
      lang: primary.lang || translationLang,
      title: primary.title || journeyTitle,
      description: primary.description || journeyDescription,
    });
    setTranslations(
      translationsToUse.map((tr) => ({
        lang: tr.lang || translationLang,
        title: tr.title || "",
        description: tr.description || "",
      })),
    );
    setSelectedTranslationLang(primary.lang || translationLang);
    setImportActiveLang(primary.lang || translationLang);

    const effectiveTitle =
      journeyTitle ||
      primary.title?.trim() ||
      translationsToUse.find((tr) => tr.title?.trim())?.title?.trim() ||
      "";
    const coverUrl = normalizeValue(extract(journeyRow, journeyCoverKeys) || "");
    const slugFromSheet = normalizeValue(extract(journeyRow, ["slug"]) || "");
    const codeFromSheet = normalizeValue(extract(journeyRow, ["code"]) || "");
    const slug = slugFromSheet || buildAutoSlug(effectiveTitle, journeyDescription, importYearHint);
    const code = codeFromSheet || buildAutoCode(effectiveTitle, journeyDescription, importYearHint);

    setGe((prev) => ({
      ...prev,
      visibility,
      cover_url: coverUrl || prev.cover_url,
      description: journeyDescription || prev.description,
      language: journeyLang || prev.language,
      slug,
      code,
    }));

    if (!effectiveTitle) {
      setImportError("Titolo non trovato nel file: aggiungi un titolo (IT o EN) per generare slug e codice.");
    } else {
      setImportError(null);
    }

    const eventTypeIndex =
      typeof parsed.eventTypeIndex === "number" && parsed.eventTypeIndex >= 0
        ? parsed.eventTypeIndex
        : (parsed.eventHeaders || []).findIndex((header) => {
            const key = normalizeKey(header || "");
            return (key.includes("type") && key.includes("event")) || (key.includes("tipo") && key.includes("evento"));
          });
    const mappedEvents: JourneyEventEditor[] = (parsed.eventRows || []).map((row, rowIdx) => {
      const ev = createEmptyEventEditor();
      const title = normalizeValue(extract(row, eventTitleKeys) || "");
      const descShort = normalizeValue(extract(row, eventDescShortKeys) || "");
      const desc = normalizeValue(extract(row, eventDescKeys) || descShort);
      const eraRaw = normalizeValue(extract(row, eventEraKeys) || "AD").toUpperCase();
      const era: "AD" | "BC" = eraRaw === "BC" ? "BC" : "AD";
      const sheetTranslations = buildEventTranslationsFromRow(row, translationLang);
      const baseTranslation =
        sheetTranslations.find((tr) => tr.lang === translationLang) ||
        sheetTranslations[0] ||
        null;
      const fallbackTitleFromSheet = sheetTranslations[0]?.title || "";
      const primaryTitle = baseTranslation?.title || title || fallbackTitleFromSheet;
      const primaryDesc = baseTranslation?.description || desc || "";
      const primaryDescShort = baseTranslation?.description_short || descShort || primaryDesc;
      const primaryWiki = baseTranslation?.wikipedia_url || normalizeValue(extract(row, eventWikipediaKeys) || "");

      ev.translation = {
        ...ev.translation,
        lang: baseTranslation?.lang || translationLang,
        title: primaryTitle,
        description_short: primaryDescShort || "",
        description: primaryDesc || "",
        wikipedia_url: primaryWiki || "",
      };
      ev.translations_all = (
        sheetTranslations.length
          ? sheetTranslations
          : [
              {
                lang: translationLang,
                title: primaryTitle,
                description: primaryDesc,
                description_short: primaryDescShort,
                wikipedia_url: primaryWiki,
              },
            ]
      ).map((tr) => ({
        id: undefined,
        lang: tr.lang || translationLang,
        title: tr.title || "",
        description: tr.description || "",
        description_short: tr.description_short || tr.description || "",
        wikipedia_url: tr.wikipedia_url || "",
        video_url: "",
      }));
      ev.event.era = era;
      ev.event.year_from = parseNumber(extract(row, eventYearFromKeys));
      ev.event.year_to = parseNumber(extract(row, eventYearToKeys));
      ev.event.exact_date = parseExactDate(extract(row, eventExactDateKeys)) || null;
      ev.event.continent = normalizeValue(extract(row, eventContinentKeys) || "") || null;
      ev.event.country = normalizeValue(extract(row, eventCountryKeys) || "") || null;
      ev.event.location = normalizeValue(extract(row, eventLocationKeys) || "") || null;
      ev.event.latitude = parseNumber(extract(row, eventLatKeys));
      ev.event.longitude = parseNumber(extract(row, eventLngKeys));
      ev.event.image_url = normalizeValue(extract(row, eventImageKeys) || "") || null;
      let typeValueRaw = "";
      if (eventTypeIndex >= 0) {
        const rawRow = parsed.eventRowsRaw?.[rowIdx];
        const cellValue = Array.isArray(rawRow) ? rawRow[eventTypeIndex] : undefined;
        typeValueRaw = normalizeValue(cellValue);
      }
      if (!typeValueRaw) {
        const rawRow = parsed.eventRowsRaw?.[rowIdx];
        const forcedIndex = 17;
        const forcedValue = Array.isArray(rawRow) ? rawRow[forcedIndex] : undefined;
        typeValueRaw = normalizeValue(forcedValue);
      }
      if (!typeValueRaw) {
        const rawRow = parsed.eventRowsRaw?.[rowIdx];
        const rawValues = Array.isArray(rawRow)
          ? rawRow.map((val) => normalizeValue(val)).filter(Boolean)
          : [];
        if (rawValues.length && availableEventTypes.length) {
          const match = rawValues.find((val) => {
            const normalized = val.toLowerCase();
            return availableEventTypes.some(
              (opt) =>
                opt.id.toLowerCase() === normalized ||
                opt.label.toLowerCase() === normalized ||
                opt.aliases.includes(normalized),
            );
          });
          if (match) {
            typeValueRaw = match;
          }
        }
        if (!typeValueRaw && rawValues.length) {
          const codeCandidate = rawValues.find(
            (val) =>
              /^[a-z]+(?:_[a-z]+)+$/i.test(val) &&
              val.length <= 40 &&
              !val.toLowerCase().includes("http"),
          );
          if (codeCandidate) {
            typeValueRaw = codeCandidate;
          }
        }
      }
      if (!typeValueRaw) {
        typeValueRaw = guessEventTypeValue(row, eventTypeKeys);
      }
      const resolveType = (value: string) => {
        const val = (value || "").trim();
        if (!val) return undefined;
        const normalized = val.toLowerCase();
        const matchById = availableEventTypes.find((opt) => opt.id === val)?.id;
        if (matchById) return matchById;
        const matchByLabel = availableEventTypes.find((opt) => opt.label.toLowerCase() === normalized)?.id;
        if (matchByLabel) return matchByLabel;
        const matchByAlias = availableEventTypes.find((opt) => opt.aliases.includes(normalized))?.id;
        if (matchByAlias) return matchByAlias;
        return val; // keep unknown code as provided to avoid losing type
      };
      const typeValue = resolveType(typeValueRaw);
      const finalType = typeValue || typeValueRaw || undefined;
      ev.import_type_raw = typeValueRaw || null;
      ev.event.event_types_id = finalType ?? null;
      ev.type_codes = finalType ? [finalType] : [];
      return ev;
    }).filter((ev) => ev.translation.title || ev.event.year_from !== null || ev.event.year_to !== null);

    if (mappedEvents.length > 0) {
      const tabMap: Record<string, EventTab> = {};
      mappedEvents.forEach((ev) => {
        tabMap[ev.tempId] = "details";
      });
      setEventTabMap(tabMap);
      setSelectedEventTempId(mappedEvents[0]?.tempId ?? null);
      setJourneyEvents(mappedEvents);
      setDeletedEventIds([]);
    } else {
      setJourneyEvents([]);
      setSelectedEventTempId(null);
    }

    setActiveTab("group");
    setJourneySubTab("general");
    setImportAppliedMessage(tUI(langCode, "build.import.applied"));
    setImportModalOpen(false);
  };

  const handleApplyImportToForm = useCallback(async () => {
    let parsed = importParsed;
    if (!parsed.journeyRow) {
      if (!importFile) {
        setImportError(tUI(langCode, "build.import.error.missing_file"));
        return;
      }
      const ext = (importFile.name.split(".").pop() || "").toLowerCase();
      if (!EXCEL_ALLOWED_EXTENSIONS.includes(ext)) {
        setImportError(tUI(langCode, "build.import.error.invalid_type"));
        return;
      }
      try {
        setImportLoading(true);
        const { preview, parsed: nextParsed } = await parseImportFile(importFile);
        setImportPreview(preview);
        setImportParsed(nextParsed);
        parsed = nextParsed;
      } catch (err: any) {
        const message =
          err?.message === "missing_sheets"
            ? tUI(langCode, "build.import.error.missing_sheets")
            : tUI(langCode, "build.import.error.generic");
        setImportError(message);
        setImportPreview(null);
        setImportParsed({ journeyRow: null, eventRows: [], eventHeaders: [], eventRowsRaw: [], eventTypeIndex: -1 });
        return;
      } finally {
        setImportLoading(false);
      }
    }

    applyParsedImport(parsed);
  }, [applyParsedImport, ge.visibility, importFile, importParsed, langCode, parseImportFile]);


  const normalizeNewJourneyStage = (value?: string | null) => {
    if (!value) return null;
    const key = value.toLowerCase();
    if (key.includes("prompt_1")) return "prompt_1";
    if (key.includes("prompt_2")) return "prompt_2";
    if (key.includes("prompt_3")) return "prompt_3";
    if (key.includes("json")) return "json";
    if (key.includes("done")) return "done";
    return null;
  };

  const buildNewJourneyLog = (payload?: { error?: string; stdout?: string; stderr?: string }) => {
    if (!payload) return "";
    const parts: string[] = [];
    if (payload.error) parts.push(`ERROR:\n${payload.error}`);
    if (payload.stdout) parts.push(`STDOUT:\n${payload.stdout}`);
    if (payload.stderr) parts.push(`STDERR:\n${payload.stderr}`);
    return parts.join("\n\n").trim();
  };

  const buildParsedFromPrompt3 = (payload: any): ImportParsedData => {
    const journeySource = Array.isArray(payload?.journey) ? payload.journey[0] : payload?.journey ?? {};
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const readValue = (source: any, keys: string[]) => {
      for (const key of keys) {
        if (source && source[key] != null) return source[key];
      }
      return "";
    };
    const journeyRow: Record<string, unknown> = {
      "Titolo IT": readValue(journeySource, ["Titolo IT", "title_it", "journey_title_it", "titleIT"]),
      "Descrizione IT": readValue(journeySource, ["Descrizione IT", "description_it", "journey_description_it"]),
      "Title EN": readValue(journeySource, ["Title EN", "title_en", "journey_title_en", "titleEN"]),
      "Description EN": readValue(journeySource, ["Description EN", "description_en", "journey_description_en"]),
    };
    const eventHeaders = [
      "Journey IT",
      "Journey EN",
      "Era (AD|BC)",
      "From (year)",
      "To (year)",
      "Event date (DD/MM/YYYY)",
      "Continent",
      "Country",
      "Location",
      "Lat (text, dot decimal)",
      "Lon (text, dot decimal)",
      "Titolo evento IT",
      "wikipedia URL evento IT",
      "Descrizione evento IT",
      "Title event EN",
      "wikipedia URL event EN",
      "Description event EN",
      "Type event",
      "Journey approfondimento 1",
      "Journey approfondimento 2",
      "Journey approfondimento 3",
    ];
    const eventRows: Record<string, string>[] = events.map((event: any) => ({
      "Journey IT": readValue(event, ["Journey IT", "journey_it", "journeyIT"]),
      "Journey EN": readValue(event, ["Journey EN", "journey_en", "journeyEN"]),
      "Era (AD|BC)": readValue(event, ["Era", "era"]),
      "From (year)": readValue(event, ["From", "from"]),
      "To (year)": readValue(event, ["To", "to"]),
      "Event date (DD/MM/YYYY)": readValue(event, ["Event date", "event_date", "eventDate"]),
      "Continent": readValue(event, ["Continent", "continent"]),
      "Country": readValue(event, ["Country", "country"]),
      "Location": readValue(event, ["Location", "location"]),
      "Lat (text, dot decimal)": readValue(event, ["Lat", "lat"]),
      "Lon (text, dot decimal)": readValue(event, ["Lon", "lon"]),
      "Titolo evento IT": readValue(event, ["Titolo evento IT", "titolo_evento_it", "title_it"]),
      "wikipedia URL evento IT": readValue(event, ["Wikipedia URL evento IT", "wikipedia_url_it"]),
      "Descrizione evento IT": readValue(event, ["Descrizione evento IT", "descrizione_evento_it", "description_it"]),
      "Title event EN": readValue(event, ["Title event EN", "title_event_en", "title_en"]),
      "wikipedia URL event EN": readValue(event, ["Wikipedia URL event EN", "wikipedia_url_en"]),
      "Description event EN": readValue(event, ["Description event EN", "description_event_en", "description_en"]),
      "Type event": readValue(event, ["Type events", "Type event", "type_events", "type_event"]),
      "Journey approfondimento 1": readValue(event, ["Journey approfondimento 1", "approfondimento_1"]),
      "Journey approfondimento 2": readValue(event, ["Journey approfondimento 2", "approfondimento_2"]),
      "Journey approfondimento 3": readValue(event, ["Journey approfondimento 3", "approfondimento_3"]),
    }));
    const eventRowsRaw = eventRows.map((row: Record<string, string>) =>
      eventHeaders.map((header) => row[header] ?? ""),
    );
    const eventTypeIndex = eventHeaders.findIndex((header) =>
      header.toLowerCase().includes("type"),
    );
    return {
      journeyRow,
      eventRows,
      eventHeaders,
      eventRowsRaw,
      eventTypeIndex,
    };
  };

  const buildReadableSummary = (payload: any) => {
    const journeyTitleIt =
      payload?.journey?.title_it || payload?.journey_title_it || payload?.journey?.titleIT || "";
    const journeyTitleEn =
      payload?.journey?.title_en || payload?.journey_title_en || payload?.journey?.titleEN || "";
    const journeyDescIt =
      payload?.journey?.description_it || payload?.journey_description_it || "";
    const journeyDescEn =
      payload?.journey?.description_en || payload?.journey_description_en || "";
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const eventLines = events.map((event: any, idx: number) => {
      const titleIt = event?.title_it || event?.titolo_evento_it || event?.titleIT || "";
      const titleEn = event?.title_en || event?.title_event_en || event?.titleEN || "";
      const era = event?.era || "";
      const from = event?.from ?? "";
      const to = event?.to ?? "";
      const location = event?.location || event?.country || "";
      const title = titleIt || titleEn || "(senza titolo)";
      const years = from || to ? `${from}${to ? `-${to}` : ""}` : "";
      const eraText = era ? `${era} ` : "";
      const place = location ? ` - ${location}` : "";
      return `${idx + 1}. ${title} ${eraText}${years}${place}`.trim();
    });
    const lines: string[] = [];
    if (journeyTitleIt || journeyTitleEn) {
      lines.push(`Journey: ${journeyTitleIt || journeyTitleEn}`);
    }
    if (journeyTitleIt && journeyTitleEn) {
      lines.push(`EN: ${journeyTitleEn}`);
    }
    if (journeyDescIt) {
      lines.push(`Descrizione IT: ${journeyDescIt}`);
    }
    if (journeyDescEn) {
      lines.push(`Descrizione EN: ${journeyDescEn}`);
    }
    lines.push(`Eventi: ${events.length}`);
    if (eventLines.length) {
      lines.push("Eventi:");
      lines.push(...eventLines);
    }
    return lines.join("\n");
  };

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const clearNewJourneyPolling = () => {
    if (newJourneyPollRef.current) {
      window.clearInterval(newJourneyPollRef.current);
      newJourneyPollRef.current = null;
    }
  };

  const clearNewJourneyRefresh = () => {
    if (newJourneyRefreshRef.current) {
      window.clearInterval(newJourneyRefreshRef.current);
      newJourneyRefreshRef.current = null;
    }
  };

  const clearNewJourneyTimer = () => {
    if (newJourneyTimerRef.current) {
      window.clearInterval(newJourneyTimerRef.current);
      newJourneyTimerRef.current = null;
    }
  };

  const clearNewJourneyTotalTimer = () => {
    if (newJourneyTotalTimerRef.current) {
      window.clearInterval(newJourneyTotalTimerRef.current);
      newJourneyTotalTimerRef.current = null;
    }
  };

  const pauseNewJourneyTotalTimer = () => {
    if (newJourneyTotalStartRef.current) {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - newJourneyTotalStartRef.current) / 1000));
      newJourneyTotalAccumRef.current += elapsedSeconds;
      newJourneyTotalStartRef.current = null;
      setNewJourneyTotalElapsed(newJourneyTotalAccumRef.current);
    }
    clearNewJourneyTotalTimer();
  };

  const startNewJourneyTotalTimer = () => {
    if (newJourneyTotalStartRef.current) return;
    newJourneyTotalStartRef.current = Date.now();
    clearNewJourneyTotalTimer();
    newJourneyTotalTimerRef.current = window.setInterval(() => {
      const startedAt = newJourneyTotalStartRef.current;
      if (!startedAt) return;
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setNewJourneyTotalElapsed(newJourneyTotalAccumRef.current + elapsedSeconds);
    }, 1000);
  };

  useEffect(() => () => {
    clearNewJourneyPolling();
    clearNewJourneyRefresh();
    clearNewJourneyTimer();
    clearNewJourneyTotalTimer();
  }, []);

  const refreshNewJourneySession = async () => {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // Best-effort refresh; fallback to current session.
    }
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token ?? null;
    if (token) {
      newJourneyTokenRef.current = token;
    }
    return token;
  };

  useEffect(() => {
    if (!newJourneyRunning || !newJourneyJobId) {
      clearNewJourneyRefresh();
      return;
    }
    refreshNewJourneySession();
    newJourneyRefreshRef.current = window.setInterval(() => {
      refreshNewJourneySession();
    }, 5 * 60 * 1000);
    return () => {
      clearNewJourneyRefresh();
    };
  }, [newJourneyRunning, newJourneyJobId]);

  const pollNewJourneyStatus = async (jobId: string) => {
    try {
      let token = newJourneyTokenRef.current;
      if (!token) {
        token = await refreshNewJourneySession();
        if (!token) {
          const { data: sessionData } = await supabase.auth.getSession();
          token = sessionData?.session?.access_token ?? null;
        }
        newJourneyTokenRef.current = token;
      }
      if (!token) {
        throw new Error("Auth session missing!");
      }
      let response = await fetch(`/api/prompt/new-journey?jobId=${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 || response.status === 403) {
        const { data: refreshed } = await supabase.auth.getSession();
        const freshToken = refreshed?.session?.access_token ?? null;
        if (freshToken) {
          newJourneyTokenRef.current = freshToken;
          response = await fetch(`/api/prompt/new-journey?jobId=${jobId}`, {
            headers: { Authorization: `Bearer ${freshToken}` },
          });
        }
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Errore durante il polling.");
      }
      const stage = normalizeNewJourneyStage(data?.stage);
      if (stage) {
        setNewJourneyStage(stage);
      }
      const logText = buildNewJourneyLog({
        error: data?.error,
        stdout: data?.stdout,
        stderr: data?.stderr,
      });
      if (logText) setNewJourneyLog(logText);

      if (data?.status === "error") {
        setNewJourneyError(data?.error || "Errore durante l'avvio.");
        setNewJourneyRunning(false);
        setNewJourneyLogOpen(true);
        newJourneyStepStartRef.current = null;
        clearNewJourneyPolling();
        clearNewJourneyRefresh();
        clearNewJourneyTimer();
        return;
      }

      if (data?.status === "done") {
        if (data?.payload) {
          const summary = buildReadableSummary(data.payload);
          setNewJourneySummary(summary);
          const step = newJourneyStepRef.current;
          if (step) {
            setNewJourneyCompletedStep((prev) => Math.max(prev, Number(step)));
            const startedAt = newJourneyStepStartRef.current;
            if (startedAt) {
              const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
              const stepKey = step === "1" ? "prompt_1" : step === "2" ? "prompt_2" : "prompt_3";
              setNewJourneyStepDurations((prev) => ({
                ...prev,
                [stepKey]: elapsedSeconds,
              }));
            }
            newJourneyStepStartRef.current = null;
          }
          if (step === "3") {
            setNewJourneyPendingPayload(data.payload);
          }
        }
        setNewJourneyResult({
          message: data?.message || "Output pronto per la validazione.",
        });
        const step = newJourneyStepRef.current;
        if (step === "1") {
          setNewJourneyStage("prompt_1");
        } else if (step === "2") {
          setNewJourneyStage("prompt_2");
        } else if (step === "3") {
          setNewJourneyStage("prompt_3");
        } else {
          setNewJourneyStage("done");
        }
        setNewJourneyRunning(false);
        clearNewJourneyPolling();
        clearNewJourneyRefresh();
        clearNewJourneyTimer();
        if (step === "1") {
          pauseNewJourneyTotalTimer();
        }
        if (step === "2") {
          window.setTimeout(() => {
            handleRunNewJourney("3");
          }, 0);
        }
        if (step === "3") {
          if (data?.payload) {
            window.setTimeout(() => {
              handleApplyNewJourneyImport(data.payload);
            }, 0);
          } else {
            setNewJourneyError("Output di Prompt 3 mancante.");
            setNewJourneyLogOpen(true);
          }
        }
        return;
      }
    } catch (err: any) {
      setNewJourneyError(err?.message || "Errore durante il polling.");
      setNewJourneyRunning(false);
      setNewJourneyLogOpen(true);
      newJourneyStepStartRef.current = null;
      clearNewJourneyPolling();
      clearNewJourneyRefresh();
      clearNewJourneyTimer();
    }
  };

  const startNewJourneyPolling = (jobId: string) => {
    clearNewJourneyPolling();
    pollNewJourneyStatus(jobId);
    newJourneyPollRef.current = window.setInterval(() => {
      pollNewJourneyStatus(jobId);
    }, 1500);
  };

  const handleCopyNewJourneyLog = async () => {
    if (!newJourneyLog) return;
    try {
      await navigator.clipboard.writeText(newJourneyLog);
      setNewJourneyCopyMessage("Copiato");
    } catch {
      setNewJourneyCopyMessage("Copia non riuscita");
    }
    window.setTimeout(() => setNewJourneyCopyMessage(null), 2000);
  };

  const openNewJourneyModal = () => {
    if (!isAdminProfile) return;
    setNewJourneyOpen(true);
    setNewJourneyError(null);
    setNewJourneyResult(null);
    setNewJourneyStage("idle");
    setNewJourneyLog("");
    setNewJourneyLogOpen(false);
    setNewJourneyCopyMessage(null);
    setNewJourneyJobId(null);
    setNewJourneyCompletedStep(0);
    setNewJourneySummary("");
    setNewJourneyElapsed(0);
    setNewJourneyTotalElapsed(0);
    setNewJourneyStepDurations({});
    setNewJourneyPendingPayload(null);
    newJourneyTokenRef.current = null;
    newJourneyStepRef.current = null;
    newJourneyStepStartRef.current = null;
    newJourneyTotalStartRef.current = null;
    newJourneyTotalAccumRef.current = 0;
    clearNewJourneyPolling();
    clearNewJourneyRefresh();
    clearNewJourneyTimer();
    clearNewJourneyTotalTimer();
  };

  const closeNewJourneyModal = () => {
    if (newJourneyRunning) return;
    setNewJourneyOpen(false);
    setNewJourneyStage("idle");
    setNewJourneyLogOpen(false);
    setNewJourneyCopyMessage(null);
    setNewJourneyJobId(null);
    setNewJourneySummary("");
    setNewJourneyElapsed(0);
    setNewJourneyTotalElapsed(0);
    setNewJourneyStepDurations({});
    setNewJourneyPendingPayload(null);
    newJourneyTokenRef.current = null;
    newJourneyStepRef.current = null;
    newJourneyStepStartRef.current = null;
    newJourneyTotalStartRef.current = null;
    newJourneyTotalAccumRef.current = 0;
    clearNewJourneyPolling();
    clearNewJourneyRefresh();
    clearNewJourneyTimer();
    clearNewJourneyTotalTimer();
  };

  const handleRunNewJourney = async (step: "1" | "2" | "3") => {
    if (!newJourneyCanRun) return;
    setNewJourneyRunning(true);
    setNewJourneyError(null);
    setNewJourneyResult(null);
    setNewJourneyLog("");
    setNewJourneyLogOpen(false);
    setNewJourneyCopyMessage(null);
    setNewJourneyStage(step === "1" ? "prompt_1" : step === "2" ? "prompt_2" : "prompt_3");
    setNewJourneyJobId(null);
    newJourneyTokenRef.current = null;
    newJourneyStepRef.current = step;
    setNewJourneyPendingPayload(null);
    setNewJourneyElapsed(0);
    newJourneyStepStartRef.current = Date.now();
    startNewJourneyTotalTimer();
    clearNewJourneyTimer();
    newJourneyTimerRef.current = window.setInterval(() => {
      setNewJourneyElapsed((prev) => prev + 1);
    }, 1000);
    clearNewJourneyPolling();
    clearNewJourneyRefresh();
    try {
      const refreshedToken = await refreshNewJourneySession();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = refreshedToken || sessionData?.session?.access_token || null;
      if (sessionError || !accessToken) {
        throw new Error("Auth session missing!");
      }
      const response = await fetch("/api/prompt/new-journey", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: newJourneyTitle.trim(),
          audience: newJourneyAudience,
          style: newJourneyStyle,
          step,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const logText = buildNewJourneyLog({
          error: data?.error,
          stdout: data?.stdout,
          stderr: data?.stderr,
        });
        if (logText) setNewJourneyLog(logText);
        setNewJourneyError(data?.error || "Errore durante l'avvio.");
        setNewJourneyLogOpen(true);
        setNewJourneyRunning(false);
        newJourneyStepStartRef.current = null;
        clearNewJourneyTimer();
        return;
      }
      if (!data?.jobId) {
        throw new Error("Job ID mancante.");
      }
      newJourneyTokenRef.current = accessToken;
      setNewJourneyJobId(data.jobId);
      startNewJourneyPolling(data.jobId);
    } catch (err: any) {
      setNewJourneyError(err?.message || "Errore durante l'avvio.");
      const logText = buildNewJourneyLog({ error: err?.message || "" });
      if (logText) setNewJourneyLog(logText);
      setNewJourneyLogOpen(true);
      setNewJourneyRunning(false);
      newJourneyStepStartRef.current = null;
      clearNewJourneyTimer();
    }
  };

  const handleApplyNewJourneyImport = (payload?: any) => {
    if (newJourneyRunning) return;
    const payloadToImport = payload ?? newJourneyPendingPayload;
    if (!payloadToImport) {
      setNewJourneyError("Nessun output da importare.");
      return;
    }
    setNewJourneyRunning(true);
    setNewJourneyError(null);
    setNewJourneyResult(null);
    setNewJourneyStage("json");
    newJourneyStepStartRef.current = Date.now();
    try {
      const parsed = buildParsedFromPrompt3(payloadToImport);
      applyParsedImport(parsed);
      const startedAt = newJourneyStepStartRef.current;
      if (startedAt) {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        setNewJourneyStepDurations((prev) => ({
          ...prev,
          json: elapsedSeconds,
        }));
      }
      newJourneyStepStartRef.current = null;
      setNewJourneyResult({ message: "Import completato nel builder." });
      setNewJourneyCompletedStep((prev) => Math.max(prev, 4));
      setNewJourneyStage("done");
      setNewJourneyPendingPayload(null);
      pauseNewJourneyTotalTimer();
    } catch (err: any) {
      setNewJourneyError(err?.message || "Errore durante l'import.");
      setNewJourneyLogOpen(true);
    } finally {
      setNewJourneyRunning(false);
    }
  };

  const renderGroupEventPage = () => {
    const allowFlags: { key: AllowFlagKey; label: string }[] = [
      { key: "allow_fan", label: tUI(langCode, "build.audience.fan") },
      { key: "allow_stud_high", label: tUI(langCode, "build.audience.stud_high") },
      { key: "allow_stud_middle", label: tUI(langCode, "build.audience.stud_middle") },
      { key: "allow_stud_primary", label: tUI(langCode, "build.audience.stud_primary") },
    ];

    return (
      <section className="rounded-3xl border border-neutral-200/80 bg-white/80 backdrop-blur p-6 shadow-xl">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white px-3 py-2 sm:flex-row sm:flex-nowrap sm:items-center">
          <div className="order-2 flex flex-col gap-2 sm:order-1 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-3">
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
              <div className="w-full overflow-x-auto">
                <div className="flex flex-nowrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2 py-2 shadow-sm min-w-fit">
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
              </div>
            )}
            {activeTab === "events" && (
              <div className="w-full overflow-x-auto">
                <div className="flex flex-nowrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2 py-2 shadow-sm min-w-fit">
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
              </div>
            )}
          </div>
          <div className="order-1 ml-auto flex w-full flex-wrap items-center gap-2 justify-start sm:order-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            <div className="flex w-full flex-col gap-1.5 rounded-2xl border border-neutral-200 bg-white/80 px-3 py-1.5 shadow-sm sm:w-auto">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] leading-none text-neutral-500">
                {tUI(langCode, "build.actions.create_journey_group")}
              </p>
              <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
                {isAdminProfile && (
                  <button
                    type="button"
                    className="h-8 w-full sm:w-[78px] rounded-full border border-emerald-200 bg-white px-2 text-[11px] font-semibold text-emerald-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 text-center flex items-center justify-center"
                    onClick={openNewJourneyModal}
                  >
                    AI
                  </button>
                )}
                <button
                  type="button"
                  className="h-8 w-full sm:w-[70px] rounded-full border border-sky-200 bg-white px-2 text-[11px] font-semibold text-sky-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 text-center"
                  onClick={handleNewJourney}
                >
                  {tUI(langCode, "build.actions.new")}
                </button>
                <button
                  type="button"
                  className="h-8 w-full sm:w-[70px] rounded-full border border-amber-200 bg-white px-2 text-[11px] font-semibold text-amber-700 shadow-sm hover:border-amber-300 hover:bg-amber-50 text-center"
                  onClick={() => {
                    resetImportState();
                    setImportModalOpen(true);
                  }}
                >
                  {tUI(langCode, "build.actions.import")}
                </button>
              </div>
            </div>
            <button
              type="button"
              className={`h-8 w-full sm:w-20 rounded-full px-2.5 text-[11px] font-semibold shadow-md transition text-center ${
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
              className={`h-8 w-full sm:w-20 rounded-full px-2.5 text-[11px] font-semibold shadow-md transition text-center ${
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
              className={`h-8 w-full sm:w-20 rounded-full px-2.5 text-[11px] font-semibold shadow-md transition text-center ${
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
                        disabled
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
                      <div className="grid gap-3 md:grid-cols-[minmax(220px,_288px)_1fr] items-start">
                        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 p-3 w-full aspect-[9/5]">
                          {(() => {
                            const previewUrl = previewUrlFromMedia(media);
                            if (!previewUrl) {
                              return (
                                <p className="text-xs text-neutral-500">
                                  {isItalian ? "Nessuna anteprima" : "No preview yet"}
                                </p>
                              );
                            }
                            const showVideo = isProbablyVideo(previewUrl, media.kind);
                            return showVideo ? (
                              <video
                                src={previewUrl}
                                controls
                                className="h-full w-full rounded-lg bg-black object-cover"
                              />
                            ) : (
                              <img
                                src={previewUrl}
                                alt={media.title || "media preview"}
                                className="h-full w-full rounded-lg object-cover"
                              />
                            );
                          })()}
                        </div>
                        <div className="space-y-3">
                          <div className="grid gap-3 items-end md:grid-cols-2 xl:grid-cols-[80px_minmax(180px,_2fr)_minmax(150px,_1fr)_minmax(120px,_0.9fr)]">
                            <Input
                              label={tUI(langCode, "build.media.order")}
                              type="number"
                              className="w-20"
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
                              label={isItalian ? "Ruolo" : "Role"}
                              value={media.role ?? ""}
                              onChange={(value) => updateMediaItemField(safeIndex, "role", value)}
                              options={mediaRoleOptions}
                            />
                            <Select
                              label={tUI(langCode, "build.media.type")}
                              value={media.kind}
                              onChange={(value) => updateMediaItemField(safeIndex, "kind", value as MediaKind)}
                              options={mediaKindOptions}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-neutral-600">
                              {isItalian ? "Sorgente" : "Source"}
                            </span>
                            {(["url", "file"] as const).map((mode) => {
                              const active = (media.sourceType || "url") === mode;
                              return (
                                <button
                                  key={mode}
                                  type="button"
                                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                    active
                                      ? "border-sky-500 bg-sky-50 text-sky-700"
                                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                                  }`}
                                  onClick={() =>
                                    updateMediaItemField(safeIndex, "sourceType", mode as "url" | "file")
                                  }
                                >
                                  {mode === "url" ? "URL" : isItalian ? "File locale" : "Upload file"}
                                </button>
                              );
                            })}
                          {media.role === "cover" && (
                            <span className="text-[11px] text-neutral-500">
                              {isItalian ? "Solo immagini" : "Images only"}
                            </span>
                          )}
                          {(media.sourceType || "url") === "url" && (
                            <input
                              type="url"
                              className="h-9 w-full max-w-[360px] flex-1 rounded-xl border border-neutral-200 bg-white/80 px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70"
                              aria-label={tUI(langCode, "build.media.public_url")}
                              value={media.public_url || media.source_url || ""}
                              onChange={(e) =>
                                setGroupEventMedia((prev) =>
                                  prev.map((item, idx) =>
                                    idx === safeIndex
                                      ? { ...item, public_url: e.target.value, source_url: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                              placeholder={tUI(langCode, "build.media.url.placeholder")}
                            />
                          )}
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-600 ml-auto"
                            onClick={() => removeMediaItem(safeIndex)}
                          >
                            {tUI(langCode, "build.media.delete")}
                          </button>
                        </div>
                        {(media.sourceType || "url") === "file" && (
                          <div className="w-full space-y-2">
                            <input
                              type="file"
                              accept={buildAcceptFromKind(media.kind)}
                              onChange={(e) => handleGroupMediaFileChange(safeIndex, e.target.files?.[0] || null)}
                                className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border file:border-neutral-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-neutral-700 hover:file:border-neutral-300"
                              />
                              {media.localFile && (
                                <p className="text-xs text-neutral-500">
                                  {media.localFile.name} ({Math.round(media.localFile.size / 1024)} KB)
                                </p>
                              )}
                              {media.uploadError && (
                                <p className="text-xs text-red-600">{media.uploadError}</p>
                              )}
                            </div>
                          )
                        }
                        </div>
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
                <div className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-semibold text-neutral-600">
                  {tUI(langCode, "build.translations.selected_label")}: {selectedTranslationLang || importActiveLang}
                </div>
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
                          textareaClassName="min-h-[220px]"
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
                            value={ev.type_codes[0] || ev.event.event_types_id || ev.import_type_raw || ""}
                            onChange={(value) =>
                              setJourneyEvents((prev) =>
                                prev.map((item) =>
                                  item.tempId === ev.tempId
                                    ? {
                                        ...item,
                                        type_codes: value ? [value] : [],
                                        event: { ...item.event, event_types_id: value || null },
                                        import_type_raw: value || null,
                                      }
                                    : item,
                                ),
                              )
                            }
                            options={(() => {
                              const baseOptions = [
                                { value: "", label: tUI(langCode, "build.events.type.placeholder") },
                                ...availableEventTypes.map((opt) => ({ value: opt.id, label: opt.label })),
                              ];
                              const current = ev.type_codes[0] || ev.event.event_types_id || ev.import_type_raw;
                              if (current && !baseOptions.some((opt) => opt.value === current)) {
                                return [...baseOptions, { value: current, label: current }];
                              }
                              return baseOptions;
                            })()}
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
                            return (
                              <div key={m.tempId} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
                                <div className="grid gap-4 items-end md:grid-cols-2 xl:grid-cols-[80px_minmax(180px,_2fr)_minmax(150px,_1fr)_minmax(120px,_0.9fr)]">
                                  <Input
                                    label={tUI(langCode, "build.media.order")}
                                    type="number"
                                    className="w-20"
                                    value={(m.sort_order ?? mIdx + 1).toString()}
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
                                    label={isItalian ? "Ruolo" : "Role"}
                                    value={m.role ?? ""}
                                    onChange={(value) =>
                                      setJourneyEvents((prev) =>
                                        prev.map((item) => {
                                          if (item.tempId !== ev.tempId) return item;
                                          const nextMedia = [...item.media];
                                          nextMedia[mIdx] = { ...nextMedia[mIdx], role: value };
                                          return { ...item, media: nextMedia };
                                        }),
                                      )
                                    }
                                    options={mediaRoleOptions}
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
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-red-600 ml-auto"
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
                                <div className="grid gap-4 md:grid-cols-[1.5fr_minmax(220px,_1fr)] items-start">
                                  <div className="flex flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-semibold text-neutral-600">
                                        {isItalian ? "Sorgente" : "Source"}
                                      </span>
                                      {(["url", "file"] as const).map((mode) => {
                                        const active = (m.sourceType || "url") === mode;
                                        return (
                                          <button
                                            key={mode}
                                            type="button"
                                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                              active
                                                ? "border-sky-500 bg-sky-50 text-sky-700"
                                                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                                            }`}
                                            onClick={() =>
                                              setJourneyEvents((prev) =>
                                                prev.map((item) => {
                                                  if (item.tempId !== ev.tempId) return item;
                                                  const nextMedia = [...item.media];
                                                  nextMedia[mIdx] = { ...nextMedia[mIdx], sourceType: mode };
                                                  return { ...item, media: nextMedia };
                                                }),
                                              )
                                            }
                                          >
                                            {mode === "url" ? "URL" : isItalian ? "File locale" : "Upload file"}
                                          </button>
                                        );
                                      })}
                                      {m.role === "cover" && (
                                        <span className="text-[11px] text-neutral-500">
                                          {isItalian ? "Solo immagini" : "Images only"}
                                        </span>
                                      )}
                                    </div>
                                    {(m.sourceType || "url") === "url" ? (
                                      <Input
                                        label={tUI(langCode, "build.media.public_url")}
                                        value={m.public_url || m.source_url || ""}
                                        placeholder={tUI(langCode, "build.media.url.placeholder")}
                                        onChange={(value) =>
                                          setJourneyEvents((prev) =>
                                            prev.map((item) => {
                                              if (item.tempId !== ev.tempId) return item;
                                              const nextMedia = [...item.media];
                                              nextMedia[mIdx] = {
                                                ...nextMedia[mIdx],
                                                public_url: value,
                                                source_url: value,
                                              };
                                              return { ...item, media: nextMedia };
                                            }),
                                          )
                                        }
                                      />
                                    ) : (
                                      <div className="space-y-2">
                                        <input
                                          type="file"
                                          accept={buildAcceptFromKind(m.kind)}
                                          onChange={(e) =>
                                            handleEventMediaFileChange(ev.tempId, mIdx, e.target.files?.[0] || null)
                                          }
                                          className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border file:border-neutral-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-neutral-700 hover:file:border-neutral-300"
                                        />
                                        {m.localFile && (
                                          <p className="text-xs text-neutral-500">
                                            {m.localFile.name} ({Math.round(m.localFile.size / 1024)} KB)
                                          </p>
                                        )}
                                        {m.uploadError && <p className="text-xs text-red-600">{m.uploadError}</p>}
                                      </div>
                                    )}
                                  </div>
                                  <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 p-3 h-36">
                                    {(() => {
                                      const previewUrl = previewUrlFromMedia(m as any);
                                      if (!previewUrl) {
                                        return (
                                          <p className="text-xs text-neutral-500">
                                            {isItalian ? "Nessuna anteprima" : "No preview yet"}
                                          </p>
                                        );
                                      }
                                      const showVideo = isProbablyVideo(previewUrl, m.kind);
                                      return showVideo ? (
                                        <video
                                          src={previewUrl}
                                          controls
                                          className="h-full w-full rounded-lg bg-black object-cover"
                                        />
                                      ) : (
                                        <img
                                          src={previewUrl}
                                          alt={m.title || "media preview"}
                                          className="h-full w-full rounded-lg object-cover"
                                        />
                                      );
                                    })()}
                                  </div>
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

  const renderNewJourneyModal = () => {
    if (!newJourneyOpen || !isAdminProfile) return null;

    const audienceOptions = [
      { value: "", label: "Seleziona un target" },
      ...NEW_JOURNEY_TARGET_OPTIONS.map((option) => ({ value: option, label: option })),
    ];
    const styleOptions = [
      { value: "", label: "Seleziona uno stile" },
      ...NEW_JOURNEY_STYLE_OPTIONS.map((option) => ({ value: option, label: option })),
    ];

    const steps = [
      { id: "prompt_1", label: "Prompt 1: input base" },
      { id: "prompt_2", label: "Prompt 2: outline" },
      { id: "prompt_3", label: "Prompt 3: JSON" },
      { id: "json", label: "Importa nel builder" },
    ];
    const isDone = newJourneyStage === "done";
    const stageIndex = steps.findIndex((step) => step.id === newJourneyStage);
    const lastStepLabel = isDone
      ? steps[steps.length - 1].label
      : stageIndex >= 0
      ? steps[stageIndex].label
      : "Non avviato";
    const isFinalized = newJourneyCompletedStep >= 4;
    const nextAction = newJourneyCompletedStep === 0 ? "1" : "2";
    const actionLabel = newJourneyRunning
      ? "In corso..."
      : newJourneyCompletedStep === 0
      ? "Avvia Prompt 1"
      : newJourneyCompletedStep === 1
      ? "Approva e avvia Prompt 2"
      : isFinalized
      ? "Completato"
      : "In corso...";
    const actionClass =
      newJourneyCompletedStep === 0
        ? "bg-sky-600 text-white hover:bg-sky-500"
        : newJourneyCompletedStep === 1
        ? "bg-amber-600 text-white hover:bg-amber-500"
        : "bg-emerald-700 text-white hover:bg-emerald-600";
    const actionDisabled =
      isFinalized || newJourneyRunning || !newJourneyCanRun || newJourneyCompletedStep >= 2;

    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 py-6">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="space-y-4 px-6 py-5">
            <Input
              label="Titolo del Journey"
              value={newJourneyTitle}
              onChange={setNewJourneyTitle}
              placeholder="Inserisci il titolo"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <Select
                label="Target audience"
                value={newJourneyAudience}
                onChange={setNewJourneyAudience}
                options={audienceOptions}
                className="sm:max-w-[240px] w-full"
              />
              <Select
                label="Stile narrativo"
                value={newJourneyStyle}
                onChange={setNewJourneyStyle}
                options={styleOptions}
                className="sm:max-w-[240px] w-full"
              />
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white/70 p-4 text-xs text-neutral-600">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  Stato avanzamento
                </p>
                <p className="text-[11px] font-semibold text-neutral-500">
                  Tempo trascorso: {formatElapsed(newJourneyTotalElapsed)}
                </p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {steps.map((step, index) => {
                  const isComplete = isDone || (stageIndex !== -1 && index < stageIndex);
                  const isActive =
                    !isDone && index === stageIndex && (newJourneyRunning || newJourneyError || newJourneyResult);
                  const durationSeconds = newJourneyStepDurations[step.id];
                  const durationLabel =
                    isActive && newJourneyRunning
                      ? formatElapsed(newJourneyElapsed)
                      : durationSeconds != null
                      ? formatElapsed(durationSeconds)
                      : null;
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center justify-between rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        isComplete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : isActive
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-neutral-200 bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      <span>
                        {step.label}
                        {durationLabel ? ` · ${durationLabel}` : ""}
                      </span>
                      {isComplete && <span>OK</span>}
                      {isActive && !isComplete && <span>...</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {newJourneyRunning && (
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold text-sky-700">
                    In corso
                  </span>
                )}
                {!newJourneyRunning && newJourneyStage === "done" && !newJourneyError && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                    Completato
                  </span>
                )}
                {newJourneyError && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-[11px] font-semibold text-red-700">
                    Errore
                  </span>
                )}
                <span className="text-[11px] text-neutral-500">
                  Ultimo step: {lastStepLabel}
                </span>
              </div>
            </div>

            {newJourneySummary && (
              <div className="max-h-48 overflow-auto rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 text-xs text-neutral-700 whitespace-pre-wrap">
                {newJourneySummary}
              </div>
            )}

            {newJourneyError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="flex items-start justify-between gap-3">
                  <span>{newJourneyError}</span>
                  <button
                    type="button"
                    className="rounded-full border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 shadow-sm hover:border-red-300"
                    onClick={() => setNewJourneyLogOpen(true)}
                  >
                    Apri log
                  </button>
                </div>
              </div>
            )}
            {newJourneyResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-800">
                <p className="font-semibold">{newJourneyResult.message}</p>
                {newJourneyResult.filePath && <p className="mt-1 break-all">{newJourneyResult.filePath}</p>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-6 py-4">
            <button
              type="button"
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={closeNewJourneyModal}
              disabled={newJourneyRunning}
            >
              Annulla
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {isFinalized && (
                <button
                  type="button"
                  className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:border-neutral-400"
                  onClick={closeNewJourneyModal}
                >
                  Chiudi
                </button>
              )}
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold shadow-md transition ${
                  !actionDisabled ? actionClass : "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                }`}
                onClick={() => handleRunNewJourney(nextAction)}
                disabled={actionDisabled}
              >
                {actionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderNewJourneyLogDrawer = () => {
    if (!newJourneyLogOpen) return null;
    const logText = newJourneyLog || "Nessun log disponibile.";

    return (
      <div className="fixed inset-0 z-[80] flex justify-end bg-black/30">
        <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-neutral-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Log dettagliato</p>
              <p className="text-xs text-neutral-500">Copia e incolla l'output completo.</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm hover:border-neutral-400"
              onClick={() => setNewJourneyLogOpen(false)}
            >
              Chiudi
            </button>
          </div>
          <div className="flex-1 overflow-auto px-4 py-4">
            <textarea
              className="h-full min-h-[50vh] w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700"
              value={logText}
              readOnly
            />
          </div>
          <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3">
            <span className="text-xs text-neutral-500">{newJourneyCopyMessage ?? ""}</span>
            <button
              type="button"
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleCopyNewJourneyLog}
              disabled={!newJourneyLog}
            >
              Copia log
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderImportModal = () => {
    if (!importModalOpen) return null;

    return (
      <div
        className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 px-4 py-6"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleImportDrop}
      >
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-neutral-200 px-6 py-4">
            <div>
              <p className="text-lg font-semibold text-neutral-900">{tUI(langCode, "build.import.title")}</p>
              <p className="mt-1 text-sm text-neutral-600">{tUI(langCode, "build.import.description")}</p>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 text-sm text-neutral-700">
                    <p className="text-xs text-neutral-500">{tUI(langCode, "build.import.template.helper")}</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-neutral-400"
                  onClick={handleDownloadTemplate}
                  disabled={importLoading}
                >
                  {tUI(langCode, "build.import.template.button")}
                </button>
              </div>
            </div>

            <div
              className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={handleImportDrop}
            >
              <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800" htmlFor="journey-import-file">
                {tUI(langCode, "build.import.select_label")}
              </label>
              <input
                id="journey-import-file"
                type="file"
                accept=".xlsx,.xls"
                className="mt-2 text-sm text-neutral-700"
                onChange={(event) => handleImportFileChange(event.target.files)}
                disabled={importLoading}
              />
              {importFile && (
                <p className="mt-2 text-xs text-neutral-700">
                  {tUI(langCode, "build.import.selected")}:{" "}
                  <span className="font-semibold text-neutral-900">{importFile.name}</span>
                </p>
              )}
            </div>

            {importPreview && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <p className="font-semibold">{tUI(langCode, "build.import.preview.title")}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <span>
                    {tUI(langCode, "build.import.preview.journey_rows")}: {importPreview.journeyRows}
                  </span>
                  <span>
                    {tUI(langCode, "build.import.preview.event_rows")}: {importPreview.eventRows}
                  </span>
                  <span className="sm:col-span-2 text-xs text-sky-800">
                    {tUI(langCode, "build.import.selected")}: {importPreview.sheets.join(", ")}
                  </span>
                </div>
              </div>
            )}

            {importError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {importError}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4">
            <button
              type="button"
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:border-neutral-400"
              onClick={() => {
                resetImportState();
                setImportModalOpen(false);
              }}
              disabled={importLoading}
            >
              {tUI(langCode, "build.actions.close")}
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 text-sm font-semibold shadow-md transition ${
                importLoading
                  ? "border border-neutral-200 bg-neutral-100 text-neutral-500"
                  : "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:shadow-lg"
              }`}
              onClick={handleValidateImportFile}
              disabled={importLoading}
            >
              {importLoading ? tUI(langCode, "generic.loading") : tUI(langCode, "build.import.button.submit")}
            </button>
            {importPreview && (
              <button
                type="button"
                className="rounded-full bg-gradient-to-r from-sky-600 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg"
                onClick={handleApplyImportToForm}
                disabled={importLoading}
              >
                {tUI(langCode, "build.import.button.apply")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-amber-50 via-sky-50 to-neutral-50 text-neutral-900 lg:flex">
      {renderNewJourneyModal()}
      {renderNewJourneyLogDrawer()}
      {renderImportModal()}
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
        className={`fixed inset-y-0 left-0 z-30 w-full max-w-[320px] transform bg-white/80 backdrop-blur shadow-lg transition duration-300 ease-in-out lg:static lg:translate-x-0 lg:border-r lg:border-neutral-200/80 lg:h-screen lg:overflow-y-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } h-screen overflow-y-auto`}
      >
        <div className="sticky top-0 z-10 space-y-3 border-b border-neutral-200 bg-white/90 px-4 py-5 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/70 hover:text-sky-700"
              onClick={() => setSidebarFiltersOpen((prev) => !prev)}
            >
              <span>{isItalian ? "Ricerca e filtri" : "Search & filters"}</span>
              <svg
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${sidebarFiltersOpen ? "rotate-180" : "rotate-0"}`}
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 8l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="rounded-full border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-600 shadow-sm hover:border-neutral-400 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              {tUI(langCode, "build.actions.close")}
            </button>
          </div>
          {sidebarFiltersOpen && (
            <>
              <div className="rounded-2xl border border-neutral-200 bg-white/80 px-3 py-2 shadow-sm">
                <Input
                  size="sm"
                  label={langCode.startsWith("it") ? "Cerca journey" : "Search journeys"}
                  value={journeySearchTerm}
                  placeholder={langCode.startsWith("it") ? "Titolo, codice o anni" : "Title, code or years"}
                  onChange={setJourneySearchTerm}
                />
              </div>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[200px] rounded-2xl border border-neutral-200 bg-white/80 px-3 py-2 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                    {tUI(langCode, "build.sidebar.visibility")}
                  </p>
                  <div className="mt-2 flex flex-nowrap items-center gap-1 overflow-hidden">
                    {journeyFilterOptions.map((option) => {
                      const isActive = journeyFilter === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`rounded-full border px-2 py-1 text-xs font-semibold transition whitespace-nowrap min-w-[70px] text-center ${
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
              </div>
            </>
          )}
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
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            {tUI(langCode, "build.actions.show_journeys")}
          </button>
        </div>
        <div className="mb-2" />
        <div className="space-y-4">
          {journeyDetailsError && <p className="text-sm text-red-600">{journeyDetailsError}</p>}
          {renderGroupEventPage()}
        </div>
        {importAppliedMessage && <p className="mt-2 text-sm text-emerald-700">{importAppliedMessage}</p>}
        {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
        {eventsSaveError && <p className="mt-1 text-sm text-red-600">{eventsSaveError}</p>}
        {eventsSaveOk && <p className="mt-1 text-sm text-green-700">{`${tUI(langCode, "build.messages.events_saved_prefix")} ${eventsSaveOk}`}</p>}
        {approvalError && <p className="mt-1 text-sm text-red-600">{approvalError}</p>}
        {approvalOk && <p className="mt-1 text-sm text-green-700">{approvalOk}</p>}
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
  textareaClassName,
}: {
  label?: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  textareaClassName?: string;
}) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <textarea
        className={`w-full min-h-[96px] rounded-xl border border-neutral-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/70 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 disabled:shadow-none ${textareaClassName ?? ""}`}
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
  const [mapError, setMapError] = useState<string | null>(null);
  const handleContextLost = useCallback((event: Event) => {
    event.preventDefault();
    setMapError("Map preview not available in this environment.");
  }, []);

  // Default center over Italy to keep context relevant.
  const fallbackCenter: [number, number] = [12.4964, 41.9028];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const container = containerRef.current;
      container.addEventListener("webglcontextlost", handleContextLost as EventListener, { passive: false });

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
      setMapError(null);
    } catch (err: any) {
      console.warn("[MapPicker] map init error:", err?.message || err);
      setMapError("Map preview not available in this environment.");
      mapRef.current = null;
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener("webglcontextlost", handleContextLost as EventListener);
      }
      const map = mapRef.current;
      try {
        map?.remove();
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

  return (
    <div className={className ?? "h-64 w-full rounded-xl border border-neutral-200 overflow-hidden"}>
      {mapError ? (
        <div className="flex h-full items-center justify-center bg-neutral-50 text-sm text-neutral-600 px-4 text-center">
          {mapError}
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}
    </div>
  );
}
