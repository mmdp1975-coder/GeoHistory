import { tUI } from "@/lib/i18n/uiLabels";
import type {
  ClassroomAccessMode,
  ClassroomInviteType,
  ClassroomJourneyCatalogRow,
  ClassroomJourneyProgressRow,
  ClassroomJourneyRankingRow,
  ClassroomQuizAttemptRow,
  ClassroomQuizSummary,
  ClassroomStatus,
} from "./types";

export function classroomAccessModeLabel(
  value: ClassroomAccessMode,
  langCode?: string | null
) {
  switch (value) {
    case "private":
      return tUI(langCode, "timeline.visibility.private");
    case "community":
      return tUI(langCode, "classroom.access_mode.community");
    case "open":
      return tUI(langCode, "classroom.access_mode.open");
    default:
      return value;
  }
}

export function classroomStatusLabel(value: ClassroomStatus, langCode?: string | null) {
  switch (value) {
    case "active":
      return tUI(langCode, "classroom.status.active");
    case "archived":
      return tUI(langCode, "classroom.status.archived");
    default:
      return value;
  }
}

export function classroomInviteTypeLabel(value: ClassroomInviteType, langCode?: string | null) {
  switch (value) {
    case "link":
      return tUI(langCode, "classroom.invite_type.link");
    case "email":
      return tUI(langCode, "classroom.invite_type.email");
    case "qr":
      return tUI(langCode, "classroom.invite_type.qr");
    default:
      return value;
  }
}

export function buildClassroomInviteLink(token: string, origin?: string | null) {
  const normalizedOrigin = (origin || "").trim().replace(/\/$/, "");
  const base =
    normalizedOrigin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const path = `/module/classroom/invite?token=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

export function classroomPreview(value?: string | null, maxLength = 140) {
  const text = (value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

export function formatClassroomDate(value?: string | null, langCode?: string | null) {
  if (!value) return null;
  try {
    const locale = langCode?.toLowerCase().startsWith("it") ? "it-IT" : "en-GB";
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatClassroomCardDate(value?: string | null, langCode?: string | null) {
  if (!value) return null;
  try {
    const date = new Date(value);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    const locale = langCode?.toLowerCase().startsWith("it") ? "it-IT" : "en-GB";
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return value;
  }
}

export function normalizeClassroomError(error: unknown, langCode?: string | null) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("row-level security") ||
    normalized.includes("permission denied") ||
    normalized.includes("not allowed")
  ) {
    return tUI(langCode, "classroom.error.permission_denied");
  }

  return message || tUI(langCode, "classroom.error.generic");
}

export function classroomJourneyTitle(journey?: ClassroomJourneyCatalogRow | null) {
  return (
    journey?.translation_title?.trim() ||
    journey?.journey_slug?.trim() ||
    tUI("en", "classroom.journey.untitled")
  );
}

export function classroomJourneyPreview(
  journey?: Pick<ClassroomJourneyCatalogRow, "translation_description"> | null,
  maxLength = 120
) {
  return classroomPreview(journey?.translation_description || null, maxLength);
}

export function buildClassroomJourneyHref(input: {
  journeyId: string;
  classroomId: string;
  lastEventId?: string | null;
}) {
  const params = new URLSearchParams({
    gid: input.journeyId,
    classroomId: input.classroomId,
    source: "scorecard",
  });
  return `/module/group_event?${params.toString()}`;
}

export function buildClassroomQuizHref(input: {
  journeyId: string;
  classroomId: string;
  lang?: string | null;
}) {
  const params = new URLSearchParams({
    gid: input.journeyId,
    classroomId: input.classroomId,
  });
  if (input.lang?.trim()) params.set("lang", input.lang.trim());
  return `/module/quiz?${params.toString()}`;
}

export function getClassroomProgressState(progress?: ClassroomJourneyProgressRow | null) {
  if (!progress) {
    return {
      labelKey: "classroom.progress.not_started",
      actionKey: "classroom.progress.action.start",
    } as const;
  }
  if (progress.is_completed) {
    return {
      labelKey: "classroom.progress.completed",
      actionKey: "classroom.progress.action.review",
    } as const;
  }
  return {
    labelKey: "classroom.progress.in_progress",
    actionKey: "classroom.progress.action.continue",
  } as const;
}

function normalizeQuizPct(score: number, totalQuestions: number) {
  if (!Number.isFinite(score) || !Number.isFinite(totalQuestions) || totalQuestions <= 0) {
    return 0;
  }
  return Number(((score / totalQuestions) * 100).toFixed(1));
}

export function summarizeClassroomQuizAttempts(
  attempts: ClassroomQuizAttemptRow[]
): ClassroomQuizSummary {
  if (!attempts.length) {
    return {
      attemptsCount: 0,
      latestScore: null,
      latestPct: null,
      bestScore: null,
      bestPct: null,
      averageScore: null,
      averagePct: null,
      totalQuestions: null,
      latestAttempt: null,
    };
  }

  const ordered = attempts
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.completed_at || a.started_at).getTime();
      const bTime = new Date(b.completed_at || b.started_at).getTime();
      return bTime - aTime;
    });
  const latestAttempt = ordered[0];
  const totalQuestions = latestAttempt?.total_questions ?? attempts[0]?.total_questions ?? null;
  const scores = ordered.map((attempt) => Number(attempt.score || 0));
  const bestScore = Math.max(...scores);
  const averageScore = Number(
    (scores.reduce((sum, value) => sum + value, 0) / ordered.length).toFixed(2)
  );
  const latestScore = Number(latestAttempt.score || 0);

  return {
    attemptsCount: ordered.length,
    latestScore,
    latestPct:
      totalQuestions != null ? normalizeQuizPct(latestScore, totalQuestions) : null,
    bestScore,
    bestPct: totalQuestions != null ? normalizeQuizPct(bestScore, totalQuestions) : null,
    averageScore,
    averagePct:
      totalQuestions != null ? normalizeQuizPct(averageScore, totalQuestions) : null,
    totalQuestions,
    latestAttempt,
  };
}

export function formatClassroomQuizMetric(
  score: number | null,
  totalQuestions: number | null,
  pct: number | null,
  langCode?: string | null
) {
  if (score == null || totalQuestions == null || totalQuestions <= 0 || pct == null) {
    return tUI(langCode, "classroom.quiz.no_attempts");
  }
  const safeScore = Number.isInteger(score) ? String(score) : score.toFixed(2);
  return `${safeScore}/${totalQuestions} (${pct.toFixed(1)}%)`;
}

export function groupClassroomJourneyRankings(rows: ClassroomJourneyRankingRow[]) {
  const grouped: Record<string, ClassroomJourneyRankingRow[]> = {};
  rows.forEach((row) => {
    grouped[row.group_event_id] = grouped[row.group_event_id] || [];
    grouped[row.group_event_id].push(row);
  });
  Object.keys(grouped).forEach((groupEventId) => {
    grouped[groupEventId] = grouped[groupEventId]
      .slice()
      .sort((a, b) => a.ranking_position - b.ranking_position);
  });
  return grouped;
}
