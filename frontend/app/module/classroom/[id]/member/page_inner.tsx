"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Medal, School } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Scorecard } from "@/app/components/Scorecard";
import { tUI } from "@/lib/i18n/uiLabels";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type {
  ClassroomJourneyAssignmentRow,
  ClassroomJourneyCatalogRow,
  ClassroomJourneyProgressRow,
  ClassroomJourneyRankingRow,
  ClassroomQuizAttemptRow,
  ClassroomQuizSummary,
  ClassroomRow,
} from "../../types";
import {
  buildClassroomJourneyHref,
  classroomAccessModeLabel,
  classroomJourneyTitle,
  classroomStatusLabel,
  formatClassroomDate,
  formatClassroomQuizMetric,
  groupClassroomJourneyRankings,
  normalizeClassroomError,
  summarizeClassroomQuizAttempts,
} from "../../utils";

const JOURNEY_SELECT =
  "journey_id, journey_slug, journey_cover_url, translation_title, translation_description, translation_lang2, events_count, approved_at, visibility, is_favourite, avg_rating, ratings_count, year_from_min, year_to_max";
const ASSIGNMENT_SELECT =
  "id, classroom_id, group_event_id, sort_order, is_required, assigned_at";

type AssignmentBase = {
  id: string;
  classroom_id: string;
  group_event_id: string;
  sort_order: number;
  is_required: boolean;
  assigned_at: string;
};

function mergeAssignments(
  rows: AssignmentBase[],
  journeys: ClassroomJourneyCatalogRow[]
): ClassroomJourneyAssignmentRow[] {
  const byId = new Map(journeys.map((journey) => [journey.journey_id, journey]));
  return rows
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.assigned_at.localeCompare(b.assigned_at))
    .map((row) => ({ ...row, journey: byId.get(row.group_event_id) || null }));
}

export default function ClassroomMemberPage({ classroomId }: { classroomId: string }) {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { checking, userId, error: authError, languageCode } = useCurrentUser();

  const [row, setRow] = useState<ClassroomRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<ClassroomJourneyAssignmentRow[]>([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, ClassroomJourneyProgressRow>>({});
  const [quizSummaryMap, setQuizSummaryMap] = useState<Record<string, ClassroomQuizSummary>>({});
  const [rankingMap, setRankingMap] = useState<Record<string, ClassroomJourneyRankingRow[]>>({});

  const status = (searchParams.get("status") || "").trim();

  useEffect(() => {
    if (checking) return;
    if (!userId) {
      setRow(null);
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase
          .from("classrooms")
          .select("id, owner_profile_id, title, description, access_mode, status, created_at, updated_at")
          .eq("id", classroomId)
          .maybeSingle();
        if (!active) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setRow(null);
          setError(tUI(languageCode, "classroom.member.unavailable.message"));
          return;
        }
        setRow(data as ClassroomRow);
      } catch (err) {
        if (!active) return;
        setRow(null);
        setError(normalizeClassroomError(err, languageCode));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [checking, userId, classroomId, supabase, languageCode]);

  useEffect(() => {
    if (!row?.id || !userId) {
      setJourneys([]);
      setProgressMap({});
      setQuizSummaryMap({});
      setRankingMap({});
      return;
    }
    let active = true;
    (async () => {
      try {
        setJourneyLoading(true);
        const { data: assignmentData, error: assignmentError } = await supabase
          .from("classroom_journeys")
          .select(ASSIGNMENT_SELECT)
          .eq("classroom_id", row.id)
          .order("sort_order", { ascending: true })
          .order("assigned_at", { ascending: true });
        if (assignmentError) throw assignmentError;
        const base = (assignmentData || []) as AssignmentBase[];
        if (!active) return;
        if (!base.length) {
          setJourneys([]);
          setProgressMap({});
          setQuizSummaryMap({});
          setRankingMap({});
          return;
        }
        const ids = base.map((item) => item.group_event_id);
        const [{ data: journeyData, error: journeyError }, { data: progressData, error: progressError }, { data: quizData, error: quizError }, { data: rankingData, error: rankingError }] =
          await Promise.all([
            supabase.from("v_journeys").select(JOURNEY_SELECT).in("journey_id", ids),
            supabase
              .from("journey_progress")
              .select("id, classroom_id, group_event_id, profile_id, progress_percentage, is_completed, completed_at, last_event_id")
              .eq("classroom_id", row.id)
              .eq("profile_id", userId)
              .in("group_event_id", ids),
            supabase
              .from("quiz_attempts")
              .select("id, classroom_id, group_event_id, profile_id, score, correct_answers, total_questions, started_at, completed_at")
              .eq("classroom_id", row.id)
              .eq("profile_id", userId)
              .in("group_event_id", ids),
            supabase.rpc("classroom_journey_ranking", { p_classroom_id: row.id }),
          ]);
        if (!active) return;
        if (journeyError) throw journeyError;
        if (progressError) throw progressError;
        if (quizError) throw quizError;
        setJourneys(mergeAssignments(base, (journeyData || []) as ClassroomJourneyCatalogRow[]));
        const nextProgress: Record<string, ClassroomJourneyProgressRow> = {};
        ((progressData || []) as ClassroomJourneyProgressRow[]).forEach((item) => {
          nextProgress[item.group_event_id] = item;
        });
        setProgressMap(nextProgress);
        const groupedAttempts: Record<string, ClassroomQuizAttemptRow[]> = {};
        ((quizData || []) as ClassroomQuizAttemptRow[]).forEach((item) => {
          groupedAttempts[item.group_event_id] = groupedAttempts[item.group_event_id] || [];
          groupedAttempts[item.group_event_id].push(item);
        });
        const nextQuizSummary: Record<string, ClassroomQuizSummary> = {};
        Object.entries(groupedAttempts).forEach(([groupEventId, attempts]) => {
          nextQuizSummary[groupEventId] = summarizeClassroomQuizAttempts(attempts);
        });
        setQuizSummaryMap(nextQuizSummary);
        setRankingMap(
          rankingError ? {} : groupClassroomJourneyRankings((rankingData || []) as ClassroomJourneyRankingRow[])
        );
      } catch (err) {
        if (!active) return;
        setJourneys([]);
        setProgressMap({});
        setQuizSummaryMap({});
        setRankingMap({});
        setError((current) => current || normalizeClassroomError(err, languageCode));
      } finally {
        if (active) setJourneyLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [row?.id, userId, supabase, languageCode]);

  const joinMessage =
    status === "existing"
      ? tUI(languageCode, "classroom.member.already_joined")
      : tUI(languageCode, "classroom.member.joined");

  const startedJourneys = journeys.filter(
    (item) => (progressMap[item.group_event_id]?.progress_percentage || 0) > 0
  ).length;
  const completedJourneys = journeys.filter(
    (item) => progressMap[item.group_event_id]?.is_completed
  ).length;

  return (
    <main className="min-h-[calc(100vh-74px)] bg-[linear-gradient(180deg,#f3efe4_0%,#f8f3e8_42%,#eef4fb_100%)]">
      <div className="mx-auto max-w-[1500px] px-5 py-7">
        <section className="rounded-[30px] border border-[rgba(246,200,106,0.3)] bg-[linear-gradient(180deg,rgba(18,49,78,0.32),rgba(18,49,78,0.18))] p-6 shadow-[0_24px_56px_-40px_rgba(16,32,51,0.52)]">
          {checking || loading ? (
            <p className="text-sm text-slate-600">{tUI(languageCode, "classroom.member.loading")}</p>
          ) : authError || !userId ? (
            <StateMessage
              title={tUI(languageCode, "classroom.auth.required.title")}
              message={tUI(languageCode, "classroom.auth.required.message")}
              actionHref="/login"
              actionLabel={tUI(languageCode, "classroom.auth.login")}
            />
          ) : !row ? (
            <StateMessage
              title={tUI(languageCode, "classroom.member.unavailable.title")}
              message={error || tUI(languageCode, "classroom.member.unavailable.message")}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="truncate text-3xl font-semibold tracking-tight text-[var(--geo-navy)]">
                    {row.title}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#f6c86a]/40 bg-[#f6c86a]/18 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8d6700]">
                      {classroomAccessModeLabel(row.access_mode, languageCode)}
                    </span>
                    <span className="rounded-full border border-[rgba(18,49,78,0.14)] bg-white/92 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--geo-navy)]">
                      {classroomStatusLabel(row.status, languageCode)}
                    </span>
                    <span className="text-sm text-[rgba(16,32,51,0.68)]">
                      {tUI(languageCode, "classroom.card.created")} {formatClassroomDate(row.created_at, languageCode)}
                    </span>
                    <span className="text-sm text-[rgba(16,32,51,0.68)]">
                      {tUI(languageCode, "classroom.card.updated")} {formatClassroomDate(row.updated_at, languageCode)}
                    </span>
                  </div>
                </div>

                <Link
                  href="/module/classroom"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-4 text-sm font-semibold text-[var(--geo-navy)] shadow-sm transition hover:border-[#f6c86a]/35 hover:bg-[#fff8e8]"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {tUI(languageCode, "classroom.owner.back")}
                </Link>
              </div>

              <div className="grid gap-6 xl:h-[calc(100vh-250px)] xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden">
                <div className="space-y-5">
                  <PanelCard>
                    {row.description ? (
                      <div className="rounded-[24px] border border-[rgba(18,49,78,0.1)] bg-white/92 p-5 text-sm leading-6 text-slate-600 min-h-[180px]">
                        {row.description}
                      </div>
                    ) : null}
                  </PanelCard>

                  <PanelCard>
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--geo-navy)] text-[#f6c86a]">
                        <School className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--geo-navy)]">
                          {tUI(languageCode, "classroom.member.assigned_journeys")}
                        </h2>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MetricCard label={tUI(languageCode, "classroom.member.assigned_journeys")} value={String(journeys.length)} />
                      <MetricCard label={tUI(languageCode, "classroom.progress.in_progress")} value={String(startedJourneys)} />
                      <MetricCard label={tUI(languageCode, "classroom.progress.completed")} value={String(completedJourneys)} tone="accent" />
                      <MetricCard
                        label={tUI(languageCode, "classroom.member.ranking")}
                        value={String(Object.values(rankingMap).filter((list) => list.length > 0).length)}
                        tone="accent"
                      />
                    </div>
                  </PanelCard>
                </div>

                <PanelCard className="xl:col-span-2 xl:flex xl:min-h-0 xl:flex-col">
                  <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
                    {journeyLoading ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                        {tUI(languageCode, "classroom.member.assigned_loading")}
                      </div>
                    ) : journeys.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                        {tUI(languageCode, "classroom.member.assigned_empty")}
                      </div>
                    ) : (
                      <ul className="grid gap-4 xl:grid-cols-2">
                        {journeys.map((item) => {
                          const progress = progressMap[item.group_event_id] || null;
                          const quizSummary = quizSummaryMap[item.group_event_id] || null;
                          const rankingRows = rankingMap[item.group_event_id] || [];
                          const selfRanking =
                            rankingRows.find((ranking) => ranking.profile_id === userId) || null;
                          const progressPct = progress ? Math.round(progress.progress_percentage || 0) : 0;
                          const href = buildClassroomJourneyHref({
                            journeyId: item.group_event_id,
                            classroomId: row.id,
                            lastEventId: progress?.last_event_id || null,
                          });

                          return (
                            <li
                              key={item.id}
                              className="overflow-hidden rounded-[26px] border border-[rgba(246,200,106,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,241,233,0.93))] p-4 shadow-[0_18px_38px_-28px_rgba(16,32,51,0.52)]"
                            >
                              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(88px,1fr)]">
                                <div className="mx-auto w-full min-w-0 max-w-[320px]">
                                  <Scorecard
                                    href={href}
                                    asListItem={false}
                                    className="!h-auto"
                                    coverClassName="aspect-[5/3] !h-auto"
                                    title={classroomJourneyTitle(item.journey)}
                                    coverUrl={item.journey?.journey_cover_url || null}
                                    isFavourite={item.journey?.is_favourite ?? null}
                                    publishedAt={item.journey?.approved_at || null}
                                    averageRating={item.journey?.avg_rating ?? null}
                                    ratingsCount={item.journey?.ratings_count ?? null}
                                    eventsCount={item.journey?.events_count ?? null}
                                    yearFrom={item.journey?.year_from_min ?? null}
                                    yearTo={item.journey?.year_to_max ?? null}
                                    usePlainImg
                                  />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex h-9 min-w-[40px] items-center justify-center rounded-xl border border-[rgba(18,49,78,0.14)] bg-[rgba(18,49,78,0.05)] px-2 text-sm font-semibold text-[var(--geo-navy)]">
                                      {item.sort_order + 1}
                                    </span>
                                    {item.is_required ? (
                                      <span className="rounded-full border border-[#f6c86a]/40 bg-[#f6c86a]/18 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8d6700]">
                                        {tUI(languageCode, "classroom.member.required")}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="mt-2 grid grid-cols-3 gap-1.5 lg:max-w-[92px] lg:grid-cols-1">
                                    <MetricCard
                                      label={tUI(languageCode, "classroom.member.progress")}
                                      value={`${progressPct}%`}
                                      tone={progressPct >= 100 ? "success" : "accent"}
                                      compact
                                    />
                                    <MetricCard label={tUI(languageCode, "classroom.member.quiz.best")} value={quizSummary?.bestPct != null ? `${quizSummary.bestPct.toFixed(1)}%` : "-"} compact />
                                    <MetricCard
                                      label={tUI(languageCode, "classroom.member.ranking")}
                                      value={selfRanking ? `#${selfRanking.ranking_position}` : "-"}
                                      tone="accent"
                                      compact
                                      icon={<RankingMedal position={selfRanking?.ranking_position ?? null} />}
                                    />
                                  </div>

                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </PanelCard>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PanelCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[28px] border border-[rgba(246,200,106,0.24)] bg-[linear-gradient(180deg,rgba(18,49,78,0.28),rgba(18,49,78,0.16))] p-5 shadow-[0_22px_48px_-34px_rgba(16,32,51,0.38)] ${className ?? ""}`}>
      {children}
    </section>
  );
}

function RankingMedal({ position }: { position: number | null }) {
  const tone =
    position === 1
      ? "border-[#c99700] bg-[radial-gradient(circle_at_30%_30%,#fff3b0,#f1c232_55%,#b8860b_100%)] text-[#7a5700]"
      : position === 2
        ? "border-[#aeb8c2] bg-[radial-gradient(circle_at_30%_30%,#ffffff,#d8dee5_58%,#9aa6b2_100%)] text-[#5d6974]"
        : position === 3
          ? "border-[#a85b2a] bg-[radial-gradient(circle_at_30%_30%,#f3d1b5,#cd7f32_58%,#8c4b20_100%)] text-[#6e3a16]"
          : "border-[rgba(18,49,78,0.14)] bg-white/92 text-slate-400";

  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${tone}`}
      aria-hidden="true"
    >
      <Medal className="h-3.5 w-3.5" strokeWidth={2.2} />
    </span>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
  compact = false,
  icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent" | "success";
  compact?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border ${compact ? "px-3 py-2.5" : "px-3 py-3"} ${
        tone === "accent"
          ? "border-[#f6c86a]/35 bg-[#f6c86a]/14"
          : tone === "success"
            ? "border-emerald-500/70 bg-[linear-gradient(180deg,#34d399,#059669)]"
            : "border-[rgba(18,49,78,0.1)] bg-white/86"
      }`}
    >
      <div
        className={`${compact ? "text-[9px]" : "text-[10px]"} font-semibold uppercase tracking-[0.1em] ${
          tone === "success" ? "text-emerald-50/90" : "text-[rgba(16,32,51,0.5)]"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-0.5 flex items-center gap-1.5 ${compact ? "text-base" : "text-lg"} font-semibold ${
          tone === "success" ? "text-white" : "text-[var(--geo-navy)]"
        }`}
      >
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

function MetricStrip({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-[rgba(18,49,78,0.1)] bg-slate-50 ${compact ? "px-2.5 py-2" : "px-3 py-3"}`}>
      <dt className={`${compact ? "text-[11px]" : "text-sm"} font-medium text-slate-800`}>{label}</dt>
      <dd className={`${compact ? "mt-0.5 text-[13px]" : "mt-1"} text-slate-600`}>{value}</dd>
    </div>
  );
}

function StateMessage({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--geo-navy)]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {actionHref && actionLabel ? (
        <div className="mt-5">
          <Link href={actionHref} className="inline-flex items-center justify-center rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] hover:bg-[#123f66]">
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
