"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Plus, School } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { tUI } from "@/lib/i18n/uiLabels";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ClassroomRow } from "./types";
import {
  classroomAccessModeLabel,
  classroomStatusLabel,
  formatClassroomCardDate,
  normalizeClassroomError,
} from "./utils";

type ClassroomMembershipRow = {
  classroom_id: string;
  member_role: "owner" | "student";
  status: string;
  joined_at: string | null;
};

type JoinedClassroomCard = ClassroomRow & {
  joined_at: string | null;
  member_role: "owner" | "student";
};

type ClassroomMemberCountRow = {
  classroom_id: string;
  member_profile_id: string;
};

type ClassroomJourneyCountRow = {
  classroom_id: string;
};

type ClassroomProgressMetricRow = {
  classroom_id: string;
  is_completed: boolean;
};

type ClassroomCardMetrics = {
  journeys: number;
  members: number;
  started: number;
  completed: number;
};

const CLASSROOM_SELECT =
  "id, owner_profile_id, title, description, access_mode, status, created_at, updated_at";

export default function ClassroomListPage() {
  const supabase = useMemo(() => createClient(), []);
  const {
    checking,
    userId,
    profile,
    error: authError,
    canCreateClassroom,
    languageCode,
  } = useCurrentUser();

  const [ownedRows, setOwnedRows] = useState<ClassroomRow[]>([]);
  const [joinedRows, setJoinedRows] = useState<JoinedClassroomCard[]>([]);
  const [metricsByClassroom, setMetricsByClassroom] = useState<
    Record<string, ClassroomCardMetrics>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (checking) return;
    if (!userId || !profile?.id) {
      setOwnedRows([]);
      setJoinedRows([]);
      setMetricsByClassroom({});
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [ownedResult, membershipsResult] = await Promise.all([
          supabase
            .from("classrooms")
            .select(CLASSROOM_SELECT)
            .eq("owner_profile_id", profile.id)
            .order("updated_at", { ascending: false }),
          supabase
            .from("classroom_members")
            .select("classroom_id, member_role, status, joined_at")
            .eq("member_profile_id", profile.id)
            .eq("status", "active")
            .order("joined_at", { ascending: false }),
        ]);

        if (!active) return;
        if (ownedResult.error) throw ownedResult.error;
        if (membershipsResult.error) throw membershipsResult.error;

        const owned = (ownedResult.data || []) as ClassroomRow[];
        const memberships = (membershipsResult.data || []) as ClassroomMembershipRow[];
        setOwnedRows(owned);

        const joinedMemberships = memberships.filter(
          (membership) => membership.classroom_id && membership.member_role !== "owner"
        );

        let joinedCards: JoinedClassroomCard[] = [];
        if (joinedMemberships.length) {
          const joinedIds = Array.from(
            new Set(joinedMemberships.map((membership) => membership.classroom_id))
          );
          const { data: joinedClassrooms, error: joinedError } = await supabase
            .from("classrooms")
            .select(CLASSROOM_SELECT)
            .in("id", joinedIds)
            .order("updated_at", { ascending: false });

          if (!active) return;
          if (joinedError) throw joinedError;

          const membershipByClassroom = new Map(
            joinedMemberships.map((membership) => [membership.classroom_id, membership])
          );

          joinedCards = ((joinedClassrooms || []) as ClassroomRow[])
            .filter((row) => row.owner_profile_id !== profile.id)
            .map((row) => {
              const membership = membershipByClassroom.get(row.id);
              return {
                ...row,
                joined_at: membership?.joined_at || null,
                member_role: membership?.member_role || "student",
              };
            });
        }
        setJoinedRows(joinedCards);

        const classroomIds = Array.from(
          new Set([...owned.map((row) => row.id), ...joinedCards.map((row) => row.id)])
        );
        if (!classroomIds.length) {
          setMetricsByClassroom({});
          return;
        }

        const [membersResult, journeysResult, progressResult] = await Promise.all([
          supabase
            .from("classroom_members")
            .select("classroom_id, member_profile_id")
            .in("classroom_id", classroomIds)
            .eq("status", "active"),
          supabase
            .from("classroom_journeys")
            .select("classroom_id")
            .in("classroom_id", classroomIds),
          supabase
            .from("journey_progress")
            .select("classroom_id, is_completed")
            .in("classroom_id", classroomIds),
        ]);

        if (!active) return;
        if (membersResult.error) throw membersResult.error;
        if (journeysResult.error) throw journeysResult.error;
        if (progressResult.error) throw progressResult.error;

        const metricsSeed = Object.fromEntries(
          classroomIds.map((id) => [
            id,
            { journeys: 0, members: 0, started: 0, completed: 0 } satisfies ClassroomCardMetrics,
          ])
        ) as Record<string, ClassroomCardMetrics>;

        const seenMembers = new Set<string>();
        ((membersResult.data || []) as ClassroomMemberCountRow[]).forEach((row) => {
          const metrics = metricsSeed[row.classroom_id];
          if (!metrics) return;
          const key = `${row.classroom_id}:${row.member_profile_id}`;
          if (seenMembers.has(key)) return;
          seenMembers.add(key);
          metrics.members += 1;
        });

        ((journeysResult.data || []) as ClassroomJourneyCountRow[]).forEach((row) => {
          const metrics = metricsSeed[row.classroom_id];
          if (metrics) metrics.journeys += 1;
        });

        ((progressResult.data || []) as ClassroomProgressMetricRow[]).forEach((row) => {
          const metrics = metricsSeed[row.classroom_id];
          if (!metrics) return;
          metrics.started += 1;
          if (row.is_completed) metrics.completed += 1;
        });

        setMetricsByClassroom(metricsSeed);
      } catch (err) {
        if (!active) return;
        setOwnedRows([]);
        setJoinedRows([]);
        setMetricsByClassroom({});
        setError(normalizeClassroomError(err, languageCode));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [checking, userId, profile?.id, supabase, languageCode]);

  if (checking || loading) {
    return <PageShell title={tUI(languageCode, "classroom.page.title")}>{tUI(languageCode, "classroom.page.loading")}</PageShell>;
  }

  if (authError || !userId) {
    return (
      <PageShell title={tUI(languageCode, "classroom.page.title")}>
        <StateCard
          title={tUI(languageCode, "classroom.auth.required.title")}
          message={tUI(languageCode, "classroom.auth.required.message")}
          actions={
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] hover:bg-[#123f66]"
            >
              {tUI(languageCode, "classroom.auth.login")}
            </Link>
          }
        />
      </PageShell>
    );
  }

  const hasOwned = ownedRows.length > 0;
  const hasJoined = joinedRows.length > 0;

  return (
    <PageShell title={tUI(languageCode, "classroom.page.title")}>
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:h-[calc(100vh-215px)] xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] xl:overflow-hidden">
        <HubSection
          title={tUI(languageCode, "classroom.manage.title")}
          count={ownedRows.length}
          action={
            canCreateClassroom ? (
              <Link
                href="/module/classroom/new"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--geo-navy)] px-4 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] transition hover:bg-[#123f66]"
              >
                <Plus className="mr-2 h-4 w-4" />
                {tUI(languageCode, "classroom.create")}
              </Link>
            ) : null
          }
        >
          {!hasOwned ? (
            <StateCard
              compact
              title={
                canCreateClassroom
                  ? tUI(languageCode, "classroom.empty.manage.title")
                  : tUI(languageCode, "classroom.empty.manage_unavailable.title")
              }
              message={
                canCreateClassroom
                  ? tUI(languageCode, "classroom.empty.manage.message")
                  : tUI(languageCode, "classroom.empty.manage_unavailable.message")
              }
              actions={
                canCreateClassroom ? (
                  <Link
                    href="/module/classroom/new"
                    className="inline-flex items-center justify-center rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] hover:bg-[#123f66]"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {tUI(languageCode, "classroom.create")}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-4">
              {ownedRows.map((row) => (
                <ClassroomCard
                  key={row.id}
                  row={row}
                  metrics={metricsByClassroom[row.id]}
                  languageCode={languageCode}
                  primaryHref={`/module/classroom/${encodeURIComponent(row.id)}`}
                  primaryLabel={tUI(languageCode, "classroom.card.open")}
                />
              ))}
            </ul>
          )}
        </HubSection>

        <div
          aria-hidden
          className="hidden w-px self-stretch rounded-full bg-[linear-gradient(180deg,rgba(246,200,106,0.18),rgba(18,49,78,0.28),rgba(246,200,106,0.18))] xl:block"
        />

        <HubSection
          title={tUI(languageCode, "classroom.joined.title")}
          count={joinedRows.length}
          accent="light"
        >
          {hasJoined ? (
            <ul className="space-y-4">
              {joinedRows.map((row) => (
                <ClassroomCard
                  key={row.id}
                  row={row}
                  metrics={metricsByClassroom[row.id]}
                  languageCode={languageCode}
                  primaryHref={`/module/classroom/${encodeURIComponent(row.id)}/member`}
                  primaryLabel={tUI(languageCode, "classroom.card.open")}
                />
              ))}
            </ul>
          ) : (
            <StateCard
              compact
              title={tUI(languageCode, "classroom.empty.none.title")}
              message={tUI(languageCode, "classroom.empty.none.message")}
            />
          )}
        </HubSection>
      </div>
    </PageShell>
  );
}

function HubSection({
  title,
  count,
  action,
  accent = "default",
  children,
}: {
  title: string;
  count: number;
  action?: ReactNode;
  accent?: "default" | "light";
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-[30px] border p-5 shadow-[0_24px_56px_-40px_rgba(16,32,51,0.52)] xl:flex xl:min-h-0 xl:flex-col ${
        accent === "light"
          ? "border-[rgba(246,200,106,0.28)] bg-[linear-gradient(180deg,rgba(18,49,78,0.22),rgba(18,49,78,0.14))]"
          : "border-[rgba(246,200,106,0.32)] bg-[linear-gradient(180deg,rgba(18,49,78,0.32),rgba(18,49,78,0.18))]"
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(18,49,78,0.88)] text-[#f6c86a] shadow-[0_16px_32px_-24px_rgba(16,32,51,0.85)]">
            <School className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-[var(--geo-navy)]">{title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-[#f6c86a]/40 bg-white/92 px-3 text-lg font-semibold text-[var(--geo-navy)] shadow-[0_16px_30px_-22px_rgba(16,32,51,0.45)]">
            {count}
          </span>
          {action}
        </div>
      </div>

      <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">{children}</div>
    </section>
  );
}

function ClassroomCard({
  row,
  metrics,
  languageCode,
  primaryHref,
  primaryLabel,
}: {
  row: ClassroomRow;
  metrics?: ClassroomCardMetrics;
  languageCode?: string | null;
  primaryHref: string;
  primaryLabel: string;
}) {
  const createdLabel = formatClassroomCardDate(row.created_at, languageCode);
  const updatedLabel = formatClassroomCardDate(row.updated_at, languageCode);
  const journeys = metrics?.journeys ?? 0;
  const members = metrics?.members ?? 0;
  const started = metrics?.started ?? 0;
  const completed = metrics?.completed ?? 0;
  const engagementRate = members > 0 ? Math.round((started / members) * 100) : 0;
  const completionRate = members > 0 ? Math.round((completed / members) * 100) : 0;
  const kpis = [
    { label: tUI(languageCode, "classroom.card.kpi.journeys"), value: journeys },
    { label: tUI(languageCode, "classroom.card.kpi.learners"), value: members },
    { label: tUI(languageCode, "classroom.card.kpi.engagement"), value: `${engagementRate}%` },
    { label: tUI(languageCode, "classroom.card.kpi.completion"), value: `${completionRate}%` },
  ];

  return (
    <li className="rounded-[26px] border border-[rgba(246,200,106,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,241,233,0.93))] p-4 shadow-[0_18px_38px_-28px_rgba(16,32,51,0.52)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-[var(--geo-navy)]">{row.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[#f6c86a]/45 bg-[#f6c86a]/16 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8d6700]">
            {classroomAccessModeLabel(row.access_mode, languageCode)}
          </span>
          <span className="rounded-full border border-[rgba(18,49,78,0.14)] bg-[rgba(18,49,78,0.05)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--geo-navy)]">
            {classroomStatusLabel(row.status, languageCode)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-[rgba(18,49,78,0.1)] bg-white/86 px-3 py-2.5"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[rgba(16,32,51,0.5)]">
              {kpi.label}
            </div>
            <div className="mt-1 text-lg font-semibold text-[var(--geo-navy)]">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-[rgba(16,32,51,0.62)]">
          {createdLabel ? <span>{tUI(languageCode, "classroom.card.created")} {createdLabel}</span> : null}
          {updatedLabel ? <span>{tUI(languageCode, "classroom.card.updated")} {updatedLabel}</span> : null}
        </div>

        <Link
          href={primaryHref}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--geo-navy)] px-4 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] transition hover:bg-[#123f66]"
        >
          {primaryLabel}
        </Link>
      </div>
    </li>
  );
}

function PageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-[calc(100vh-74px)] bg-[linear-gradient(180deg,#f3efe4_0%,#f8f3e8_42%,#eef4fb_100%)]">
      <div className="mx-auto max-w-[1500px] px-5 py-7">
        <div className="mb-6 flex items-center justify-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--geo-navy)]">{title}</h1>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </main>
  );
}

function StateCard({
  title,
  message,
  actions,
  compact = false,
}: {
  title: string;
  message: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-[24px] border border-[rgba(246,200,106,0.24)] bg-white/88 shadow-[0_18px_38px_-28px_rgba(16,32,51,0.38)] ${compact ? "p-5" : "p-6"}`}>
      <h2 className="text-lg font-semibold text-[var(--geo-navy)]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {actions ? <div className="mt-4">{actions}</div> : null}
    </div>
  );
}
