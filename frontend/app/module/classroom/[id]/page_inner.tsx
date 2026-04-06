"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { tUI } from "@/lib/i18n/uiLabels";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Scorecard } from "@/app/components/Scorecard";
import ClassroomBasicsForm from "../_components/ClassroomBasicsForm";
import type {
  ClassroomBasicsInput,
  ClassroomInviteRow,
  ClassroomJourneyAssignmentRow,
  ClassroomJourneyCatalogRow,
  ClassroomJourneyProgressRow,
  ClassroomJourneyRankingRow,
  ClassroomQuizAttemptRow,
  ClassroomRow,
} from "../types";
import {
  buildClassroomInviteLink,
  classroomAccessModeLabel,
  classroomJourneyTitle,
  classroomStatusLabel,
  formatClassroomCardDate,
  formatClassroomDate,
  groupClassroomJourneyRankings,
  normalizeClassroomError,
} from "../utils";
import { renderQrSvg, renderQrSvgDataUrl } from "../qr";
const JOURNEY_SELECT =
  "journey_id, journey_slug, journey_cover_url, translation_title, translation_description, translation_lang2, events_count, year_from_min, year_to_max, is_favourite, approved_at, visibility";
const ASSIGNMENT_SELECT =
  "id, classroom_id, group_event_id, sort_order, is_required, assigned_at";

type JourneyVisibilityFilter = "all" | "public" | "private";
type JourneySortMode = "timeline" | "rating" | "favourites" | "published";

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

export default function ClassroomDetailPage({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { checking, userId, profile, error: authError, languageCode } = useCurrentUser();
  const [row, setRow] = useState<ClassroomRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [accessModeDraft, setAccessModeDraft] = useState<"private" | "community" | "open">("private");
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [invites, setInvites] = useState<ClassroomInviteRow[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState<string | null>(null);
  const [qrSaving, setQrSaving] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrOk, setQrOk] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<ClassroomJourneyAssignmentRow[]>([]);
  const [assignable, setAssignable] = useState<ClassroomJourneyCatalogRow[]>([]);
  const [journeySearch, setJourneySearch] = useState("");
  const [journeyVisibilityFilter, setJourneyVisibilityFilter] =
    useState<JourneyVisibilityFilter>("all");
  const [journeySortMode, setJourneySortMode] = useState<JourneySortMode>("published");
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeySaving, setJourneySaving] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [journeyOk, setJourneyOk] = useState<string | null>(null);
  const [progressCounts, setProgressCounts] = useState<Record<string, { started: number; completed: number }>>({});
  const [quizCounts, setQuizCounts] = useState<Record<string, { attempts: number; participants: number }>>({});
  const [rankingMap, setRankingMap] = useState<Record<string, ClassroomJourneyRankingRow[]>>({});
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const [journeyPanelHeight, setJourneyPanelHeight] = useState<number | null>(null);

  useEffect(() => {
    if (checking) return;
    if (!userId || !profile?.id) {
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
        const classroom = (data || null) as ClassroomRow | null;
        if (!classroom || classroom.owner_profile_id !== profile.id) {
          setRow(null);
          setError(tUI(languageCode, "classroom.owner.not_found"));
          return;
        }
        setRow(classroom);
      } catch (err) {
        if (active) {
          setRow(null);
          setError(normalizeClassroomError(err, languageCode));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [checking, userId, profile?.id, classroomId, supabase]);

  async function loadInvites(currentClassroomId: string) {
    setInviteLoading(true);
    setInviteError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("classroom_invites")
        .select("id, classroom_id, token, invite_type, email_target, active, created_at")
        .eq("classroom_id", currentClassroomId)
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setInvites((data || []) as ClassroomInviteRow[]);
    } catch (err) {
      setInviteError(normalizeClassroomError(err, languageCode));
    } finally {
      setInviteLoading(false);
    }
  }

  async function loadAssigned(currentClassroomId: string) {
    setJourneyLoading(true);
    setJourneyError(null);
    try {
      const { data: assignmentData, error: assignmentError } = await supabase
        .from("classroom_journeys")
        .select(ASSIGNMENT_SELECT)
        .eq("classroom_id", currentClassroomId)
        .order("sort_order", { ascending: true })
        .order("assigned_at", { ascending: true });
      if (assignmentError) throw assignmentError;
      const base = (assignmentData || []) as AssignmentBase[];
      if (!base.length) {
        setAssigned([]);
        return;
      }
      const { data: journeyData, error: journeyFetchError } = await supabase
        .from("v_journeys")
        .select(JOURNEY_SELECT)
        .in("journey_id", base.map((item) => item.group_event_id));
      if (journeyFetchError) throw journeyFetchError;
      setAssigned(mergeAssignments(base, (journeyData || []) as ClassroomJourneyCatalogRow[]));
    } catch (err) {
      setAssigned([]);
      setJourneyError(normalizeClassroomError(err, languageCode));
    } finally {
      setJourneyLoading(false);
    }
  }

  useEffect(() => {
    if (!row?.id) {
      setInvites([]);
      setAssigned([]);
      setProgressCounts({});
      setQuizCounts({});
      setRankingMap({});
      return;
    }
    void loadInvites(row.id);
    void loadAssigned(row.id);
  }, [row?.id]);

  useEffect(() => {
    setTitleDraft(row?.title || "");
  }, [row?.title]);

  useEffect(() => {
    setAccessModeDraft((row?.access_mode as "private" | "community" | "open") || "private");
  }, [row?.access_mode]);

  useEffect(() => {
    const node = leftColumnRef.current;
    if (!node || typeof window === "undefined") return;

    const updateHeight = () => {
      if (window.innerWidth >= 1280) {
        setJourneyPanelHeight(node.getBoundingClientRect().height);
      } else {
        setJourneyPanelHeight(null);
      }
    };

    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [row?.id, assigned.length, assignable.length, journeySearch, inviteLoading, invites.length]);

  const assignedIds = useMemo(() => assigned.map((item) => item.group_event_id), [assigned]);

  useEffect(() => {
    if (!row?.id || assignedIds.length === 0) {
      setProgressCounts({});
      setQuizCounts({});
      setRankingMap({});
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("journey_progress")
          .select("id, classroom_id, group_event_id, profile_id, progress_percentage, is_completed, completed_at, last_event_id")
          .eq("classroom_id", row.id)
          .in("group_event_id", assignedIds);
        if (!active) return;
        if (fetchError) throw fetchError;
        const next: Record<string, { started: number; completed: number }> = {};
        ((data || []) as ClassroomJourneyProgressRow[]).forEach((progress) => {
          const current = next[progress.group_event_id] || { started: 0, completed: 0 };
          current.started += 1;
          if (progress.is_completed) current.completed += 1;
          next[progress.group_event_id] = current;
        });
        setProgressCounts(next);
      } catch {
        if (active) setProgressCounts({});
      }
    })();
    return () => {
      active = false;
    };
  }, [row?.id, assignedIds, supabase]);

  useEffect(() => {
    if (!row?.id || assignedIds.length === 0) {
      setQuizCounts({});
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("quiz_attempts")
          .select(
            "id, classroom_id, group_event_id, profile_id, score, correct_answers, total_questions, started_at, completed_at"
          )
          .eq("classroom_id", row.id)
          .in("group_event_id", assignedIds);
        if (!active) return;
        if (fetchError) throw fetchError;
        const next: Record<string, { attempts: number; participants: number }> = {};
        const participantsByJourney = new Map<string, Set<string>>();
        ((data || []) as ClassroomQuizAttemptRow[]).forEach((attempt) => {
          const current = next[attempt.group_event_id] || { attempts: 0, participants: 0 };
          current.attempts += 1;
          next[attempt.group_event_id] = current;
          const participants = participantsByJourney.get(attempt.group_event_id) || new Set<string>();
          participants.add(attempt.profile_id);
          participantsByJourney.set(attempt.group_event_id, participants);
        });
        participantsByJourney.forEach((participants, groupEventId) => {
          next[groupEventId] = {
            attempts: next[groupEventId]?.attempts || 0,
            participants: participants.size,
          };
        });
        setQuizCounts(next);
      } catch {
        if (active) setQuizCounts({});
      }
    })();
    return () => {
      active = false;
    };
  }, [row?.id, assignedIds, supabase]);

  useEffect(() => {
    if (!row?.id || assignedIds.length === 0) {
      setRankingMap({});
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data, error: rankingError } = await supabase.rpc(
          "classroom_journey_ranking",
          { p_classroom_id: row.id }
        );
        if (!active) return;
        if (rankingError) throw rankingError;
        setRankingMap(
          groupClassroomJourneyRankings((data || []) as ClassroomJourneyRankingRow[])
        );
      } catch {
        if (active) setRankingMap({});
      }
    })();
    return () => {
      active = false;
    };
  }, [row?.id, assignedIds, supabase]);

  useEffect(() => {
    if (!row?.id) {
      setAssignable([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        let query = supabase
          .from("v_journeys")
          .select(JOURNEY_SELECT);
        if (journeyVisibilityFilter !== "all") {
          query = query.eq("visibility", journeyVisibilityFilter);
        }
        const search = journeySearch.trim();
        if (search) {
          const pattern = `%${search.replace(/,/g, " ")}%`;
          query = query.or(
            [`translation_title.ilike.${pattern}`, `translation_description.ilike.${pattern}`, `journey_slug.ilike.${pattern}`].join(",")
          );
        }
        const { data, error: fetchError } = await query;
        if (!active) return;
        if (fetchError) throw fetchError;
        let rows = (data || []) as ClassroomJourneyCatalogRow[];
        if (journeySortMode === "rating" && rows.length) {
          const { data: statsData, error: statsError } = await supabase
            .from("v_group_event_rating_stats")
            .select("group_event_id, avg_rating, ratings_count")
            .in(
              "group_event_id",
              rows.map((journey) => journey.journey_id)
            );
          if (!active) return;
          if (statsError) throw statsError;
          const statsByJourney = new Map(
            ((statsData || []) as Array<{
              group_event_id: string;
              avg_rating: number | null;
              ratings_count: number | null;
            }>).map((row) => [row.group_event_id, row])
          );
          rows = rows.map((journey) => {
            const stats = statsByJourney.get(journey.journey_id);
            return {
              ...journey,
              avg_rating: stats?.avg_rating ?? null,
              ratings_count: stats?.ratings_count ?? null,
            };
          });
        }
        const filtered = rows
          .filter((journey) => !assignedIds.includes(journey.journey_id))
          .sort((a, b) => {
            if (journeySortMode === "rating") {
              const ar = a.avg_rating ?? -1;
              const br = b.avg_rating ?? -1;
              if (ar !== br) return br - ar;
              const ac = a.ratings_count ?? 0;
              const bc = b.ratings_count ?? 0;
              if (ac !== bc) return bc - ac;
            } else if (journeySortMode === "favourites") {
              const af = a.is_favourite ? 1 : 0;
              const bf = b.is_favourite ? 1 : 0;
              if (af !== bf) return bf - af;
            } else if (journeySortMode === "published") {
              const ap = a.approved_at ? new Date(a.approved_at).getTime() : 0;
              const bp = b.approved_at ? new Date(b.approved_at).getTime() : 0;
              if (ap !== bp) return bp - ap;
            }
            const ay = a.year_from_min ?? Number.POSITIVE_INFINITY;
            const by = b.year_from_min ?? Number.POSITIVE_INFINITY;
            if (ay !== by) return ay - by;
            return (b.events_count ?? 0) - (a.events_count ?? 0);
          });
        setAssignable(filtered);
      } catch (err) {
        if (active) {
          setAssignable([]);
          setJourneyError((current) => current || normalizeClassroomError(err, languageCode));
        }
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [row?.id, journeySearch, journeyVisibilityFilter, journeySortMode, assignedIds, supabase]);

  async function handleSave(values: ClassroomBasicsInput) {
    if (!row) return;
    setSaving(true);
    setError(null);
    setSaveOk(null);
    try {
      const { data, error: updateError } = await supabase
        .from("classrooms")
        .update({
          title: values.title,
          description: values.description || null,
          access_mode: values.access_mode,
        })
        .eq("id", row.id)
        .select("id, owner_profile_id, title, description, access_mode, status, created_at, updated_at")
        .single();
      if (updateError) throw updateError;
      setRow(data as ClassroomRow);
      setSaveOk(tUI(languageCode, "classroom.owner.updated"));
    } catch (err) {
      setError(normalizeClassroomError(err, languageCode));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClassroom() {
    if (!row || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    setError(null);
    setSaveOk(null);
    try {
      const { error: deleteRowError } = await supabase
        .from("classrooms")
        .delete()
        .eq("id", row.id);
      if (deleteRowError) throw deleteRowError;
      setConfirmDeleteOpen(false);
      router.push("/module/classroom");
    } catch (err) {
      setDeleteError(normalizeClassroomError(err, languageCode));
    } finally {
      setDeleting(false);
    }
  }

  const accessInvites = useMemo(
    () => invites.filter((invite) => invite.invite_type === "link" || invite.invite_type === "qr"),
    [invites]
  );
  const primaryAccessInvite = useMemo(
    () =>
      accessInvites.find((invite) => invite.invite_type === "link" && invite.active) ||
      accessInvites.find((invite) => invite.active) ||
      null,
    [accessInvites]
  );
  const qrInviteLink = useMemo(
    () => (primaryAccessInvite ? buildClassroomInviteLink(primaryAccessInvite.token) : null),
    [primaryAccessInvite]
  );
  const qrSvgMarkup = useMemo(
    () => (qrInviteLink ? renderQrSvg(qrInviteLink, { size: 256, margin: 20 }) : null),
    [qrInviteLink]
  );

  async function handleEnsureAccessInvite() {
    if (!row) return;
    setInviteSaving(true);
    setInviteError(null);
    setInviteOk(null);
    if (primaryAccessInvite) {
      setInviteSaving(false);
      setInviteOk(tUI(languageCode, "classroom.owner.access_reused"));
      return;
    }
    try {
      const { data, error: createError } = await supabase
        .from("classroom_invites")
        .insert({
          classroom_id: row.id,
          invite_type: "link",
        })
        .select("id, classroom_id, token, invite_type, email_target, active, created_at")
        .single();
      if (createError) throw createError;
      setInvites((current) => [data as ClassroomInviteRow, ...current]);
      setInviteOk(tUI(languageCode, "classroom.owner.access_created"));
    } catch (err) {
      setInviteError(normalizeClassroomError(err, languageCode));
    } finally {
      setInviteSaving(false);
    }
  }

  async function handleDeactivateInvite(inviteId: string) {
    try {
      const { data, error: updateError } = await supabase
        .from("classroom_invites")
        .update({ active: false })
        .eq("id", inviteId)
        .eq("classroom_id", row?.id || "")
        .select("id, classroom_id, token, invite_type, email_target, active, created_at")
        .single();
      if (updateError) throw updateError;
      const updated = data as ClassroomInviteRow;
      setInvites((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setInviteOk(tUI(languageCode, "classroom.owner.invite_deactivated"));
      setInviteError(null);
    } catch (err) {
      setInviteError(normalizeClassroomError(err, languageCode));
    }
  }

  async function handleDownloadQrPng() {
    if (!qrInviteLink || !primaryAccessInvite) return;
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("QR image load failed."));
        image.src = renderQrSvgDataUrl(qrInviteLink, { size: 512, margin: 32 });
      });
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas rendering is not available.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `classroom-qr-${primaryAccessInvite.id}.png`;
      link.click();
      setQrOk(tUI(languageCode, "classroom.owner.qr_downloaded"));
      setQrError(null);
    } catch (err) {
      setQrError(normalizeClassroomError(err, languageCode));
    }
  }

  async function handleCopyLink(token: string) {
    try {
      await navigator.clipboard.writeText(buildClassroomInviteLink(token));
      setCopyOk(tUI(languageCode, "classroom.owner.link_copied"));
    } catch {
      setCopyOk(tUI(languageCode, "classroom.owner.copy_failed"));
    }
    window.setTimeout(() => setCopyOk(null), 2500);
  }

  async function handleAssignJourney(journeyId: string) {
    if (!row || !journeyId) return;
    if (assignedIds.includes(journeyId)) {
      setJourneyError(tUI(languageCode, "classroom.owner.assign_duplicate"));
      return;
    }
    setJourneySaving(true);
    setJourneyError(null);
    setJourneyOk(null);
    try {
      const nextSortOrder = assigned.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
      const { error: insertError } = await supabase.from("classroom_journeys").insert({
        classroom_id: row.id,
        group_event_id: journeyId,
        sort_order: nextSortOrder,
        is_required: false,
      });
      if (insertError) throw insertError;
      await loadAssigned(row.id);
      setJourneyOk(tUI(languageCode, "classroom.owner.assign_ok"));
    } catch (err) {
      setJourneyError(normalizeClassroomError(err, languageCode));
    } finally {
      setJourneySaving(false);
    }
  }

  async function handleToggleRequired(item: ClassroomJourneyAssignmentRow) {
    setJourneySaving(true);
    setJourneyError(null);
    setJourneyOk(null);
    try {
      const { error: updateError } = await supabase
        .from("classroom_journeys")
        .update({ is_required: !item.is_required })
        .eq("id", item.id);
      if (updateError) throw updateError;
      setAssigned((current) =>
        current.map((rowItem) =>
          rowItem.id === item.id ? { ...rowItem, is_required: !item.is_required } : rowItem
        )
      );
      setJourneyOk(!item.is_required ? "Journey marked as required." : "Journey marked as optional.");
    } catch (err) {
      setJourneyError(normalizeClassroomError(err, languageCode));
    } finally {
      setJourneySaving(false);
    }
  }

  async function handleReorder(itemId: string, direction: -1 | 1) {
    if (!row) return;
    const currentIndex = assigned.findIndex((item) => item.id === itemId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= assigned.length) return;
    const reordered = assigned.slice();
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setJourneySaving(true);
    setJourneyError(null);
    setJourneyOk(null);
    try {
      await Promise.all(
        reordered.map((item, index) =>
          supabase.from("classroom_journeys").update({ sort_order: index }).eq("id", item.id)
        )
      );
      await loadAssigned(row.id);
      setJourneyOk("Journey order updated.");
    } catch (err) {
      setJourneyError(normalizeClassroomError(err, languageCode));
    } finally {
      setJourneySaving(false);
    }
  }

  async function handleUnassign(item: ClassroomJourneyAssignmentRow) {
    if (!row) return;
    setJourneySaving(true);
    setJourneyError(null);
    setJourneyOk(null);
    try {
      const { error: deleteError } = await supabase
        .from("classroom_journeys")
        .delete()
        .eq("id", item.id);
      if (deleteError) throw deleteError;
      const remaining = assigned.filter((current) => current.id !== item.id);
      await Promise.all(
        remaining.map((current, index) =>
          supabase.from("classroom_journeys").update({ sort_order: index }).eq("id", current.id)
        )
      );
      await loadAssigned(row.id);
      setJourneyOk("Journey unassigned.");
    } catch (err) {
      setJourneyError(normalizeClassroomError(err, languageCode));
    } finally {
      setJourneySaving(false);
    }
  }

  const initialValues: ClassroomBasicsInput = useMemo(
    () => ({
      title: row?.title || "",
      description: row?.description || "",
      access_mode: row?.access_mode || "private",
    }),
    [row]
  );

  return (
    <main className="min-h-[calc(100vh-74px)] bg-[linear-gradient(180deg,#f7f4ec_0%,#f4f1ea_42%,#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {row ? (
              <input
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                maxLength={160}
                placeholder={tUI(languageCode, "classroom.form.title_placeholder")}
                disabled={saving}
                className="w-full max-w-[720px] border-none bg-transparent px-0 py-0 text-3xl font-semibold tracking-tight text-[var(--geo-navy)] outline-none placeholder:text-slate-400 focus:outline-none focus:ring-0"
              />
            ) : (
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--geo-navy)]">{tUI(languageCode, "classroom.owner.title")}</h1>
            )}
            {row ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[rgba(18,49,78,0.72)]">
                <select
                  value={accessModeDraft}
                  onChange={(event) => setAccessModeDraft(event.target.value as "private" | "community" | "open")}
                  disabled={saving}
                  className="rounded-full border border-[#f6c86a]/45 bg-[#fff5d9] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8d6700] shadow-[0_10px_24px_-18px_rgba(246,200,106,0.7)] outline-none focus:ring-2 focus:ring-[#f6c86a]/55"
                >
                  <option value="private">{classroomAccessModeLabel("private", languageCode)}</option>
                  <option value="community">{classroomAccessModeLabel("community", languageCode)}</option>
                  <option value="open">{classroomAccessModeLabel("open", languageCode)}</option>
                </select>
                <span className="rounded-full border border-[rgba(18,49,78,0.14)] bg-[rgba(18,49,78,0.04)] px-3 py-1 font-semibold uppercase tracking-[0.08em] text-[var(--geo-navy)]">{classroomStatusLabel(row.status, languageCode)}</span>
                <span>{tUI(languageCode, "classroom.card.created")} {formatClassroomDate(row.created_at, languageCode)}</span>
                <span>{tUI(languageCode, "classroom.card.updated")} {formatClassroomDate(row.updated_at, languageCode)}</span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {row ? (
              <button
                type="submit"
                form="classroom-basics-form"
                disabled={saving}
                className="rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] transition hover:bg-[#123f66] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? tUI(languageCode, "classroom.form.saving") : tUI(languageCode, "classroom.owner.save")}
              </button>
            ) : null}
            {row ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={deleting}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {tUI(languageCode, "classroom.owner.delete")}
              </button>
            ) : null}
            <Link href="/module/classroom" className="inline-flex items-center justify-center rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--geo-navy)] shadow-sm hover:border-[#f6c86a]/35 hover:bg-[#fff8e8]">{tUI(languageCode, "classroom.owner.back")}</Link>
          </div>
        </div>

        {checking || loading ? (
          <PanelCard><p className="text-sm text-slate-600">{tUI(languageCode, "classroom.owner.loading")}</p></PanelCard>
        ) : authError || !userId ? (
          <PanelCard><StateMessage title={tUI(languageCode, "classroom.auth.required.title")} message={tUI(languageCode, "classroom.auth.required.message")} actionHref="/login" actionLabel={tUI(languageCode, "classroom.auth.login")} /></PanelCard>
        ) : !row ? (
          <PanelCard><StateMessage title={tUI(languageCode, "classroom.member.unavailable.title")} message={error || tUI(languageCode, "classroom.member.unavailable.message")} /></PanelCard>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.95fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div ref={leftColumnRef} className="space-y-5">
              <PanelCard>
                <ClassroomBasicsForm
                  initialValues={initialValues}
                  submitLabel={tUI(languageCode, "classroom.owner.save")}
                  langCode={languageCode}
                  formId="classroom-basics-form"
                  showSubmitButton={false}
                  hideTitleField
                  hideAccessModeField
                  externalTitle={titleDraft}
                  onExternalTitleChange={setTitleDraft}
                  externalAccessMode={accessModeDraft}
                  onExternalAccessModeChange={setAccessModeDraft}
                  submitting={saving}
                  error={error}
                  onSubmit={handleSave}
                />
                {saveOk ? <Notice tone="ok">{saveOk}</Notice> : null}
              </PanelCard>

              <PanelCard>
                <div className="space-y-4">
                  {inviteError ? <Notice tone="error">{inviteError}</Notice> : null}
                  {inviteOk ? <Notice tone="ok">{inviteOk}</Notice> : null}
                  {copyOk ? <Notice tone="info">{copyOk}</Notice> : null}
                </div>
                <div className="mt-5">
                  {inviteLoading ? <p className="text-sm text-slate-600">{tUI(languageCode, "classroom.new.loading")}</p> : !primaryAccessInvite ? (
                    <div className="space-y-4 rounded-2xl border border-[rgba(246,200,106,0.28)] bg-[#fff8e8] px-4 py-5 text-center">
                      <p className="text-sm text-slate-600">No classroom access link exists yet.</p>
                      <div>
                        <button
                          type="button"
                          onClick={handleEnsureAccessInvite}
                          disabled={inviteSaving}
                          className="rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] transition hover:bg-[#123f66] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {inviteSaving ? tUI(languageCode, "classroom.form.saving") : tUI(languageCode, "classroom.owner.create_access_link")}
                        </button>
                      </div>
                    </div>
                  ) : (
                      <div className="space-y-3">
                        <dl className="grid gap-2 text-sm text-slate-600">
                          <div className="flex items-start justify-between gap-4"><dt className="font-medium text-slate-800">{tUI(languageCode, "classroom.card.created")}</dt><dd>{formatClassroomDate(primaryAccessInvite.created_at, languageCode)}</dd></div>
                        </dl>
                        <div className="flex justify-center">
                          <div className="flex w-full max-w-[300px] items-center justify-center rounded-[24px] border border-[rgba(246,200,106,0.24)] bg-white p-3 shadow-[0_22px_48px_-34px_rgba(16,32,51,0.38)]">
                            <div className="flex h-[232px] w-[232px] items-center justify-center overflow-hidden">
                              {qrSvgMarkup ? <div className="flex h-full w-full items-center justify-center" dangerouslySetInnerHTML={{ __html: qrSvgMarkup }} /> : null}
                            </div>
                          </div>
                        </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button type="button" onClick={() => handleCopyLink(primaryAccessInvite.token)} className="rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--geo-navy)] shadow-sm transition hover:border-[#f6c86a]/35 hover:bg-[#fff8e8]">{tUI(languageCode, "classroom.owner.copy_link")}</button>
                        <button type="button" onClick={handleDownloadQrPng} className="rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--geo-navy)] shadow-sm transition hover:border-[#f6c86a]/35 hover:bg-[#fff8e8]">{tUI(languageCode, "classroom.owner.download_png")}</button>
                        <button type="button" onClick={() => handleDeactivateInvite(primaryAccessInvite.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 sm:col-span-2">{tUI(languageCode, "classroom.owner.deactivate")}</button>
                      </div>
                    </div>
                  )}
                </div>
              </PanelCard>
            </div>

            <div className="lg:col-span-2 self-stretch min-w-0">
              <div
                className="w-full min-w-0 max-w-[760px]"
                style={journeyPanelHeight && typeof window !== "undefined" && window.innerWidth >= 1280 ? { height: `${journeyPanelHeight}px` } : undefined}
              >
              <PanelCard className="flex h-full flex-col">
                {journeyError ? <Notice tone="error">{journeyError}</Notice> : null}
                {journeyOk ? <Notice tone="ok">{journeyOk}</Notice> : null}
                <div className="flex flex-wrap items-center gap-3 pb-1">
                  <input
                    type="text"
                    value={journeySearch}
                    onChange={(event) => setJourneySearch(event.target.value)}
                    placeholder={tUI(languageCode, "classroom.owner.search_placeholder")}
                    disabled={journeySaving}
                    className="w-full min-w-0 sm:min-w-[180px] sm:max-w-[240px] rounded-xl border border-[rgba(18,49,78,0.14)] bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_12px_24px_-20px_rgba(18,49,78,0.38)] focus:outline-none focus:ring-2 focus:ring-[#f6c86a]/55"
                  />
                  <div className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-[16px] border border-[rgba(246,200,106,0.16)] bg-[var(--geo-navy)] px-2.5 py-1.5 text-white shadow-[0_18px_40px_-28px_rgba(8,18,30,0.85)]">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#f6c86a] whitespace-nowrap">
                      {tUI(languageCode, "classroom.owner.sort.label")}
                    </span>
                    <div className="flex items-center gap-1">
                      {([
                        ["timeline", tUI(languageCode, "classroom.owner.sort.timeline")],
                        ["rating", tUI(languageCode, "classroom.owner.sort.rating")],
                        ["favourites", tUI(languageCode, "classroom.owner.sort.favourites")],
                        ["published", tUI(languageCode, "classroom.owner.sort.published")],
                      ] as const).map(([mode, label]) => {
                        const active = journeySortMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setJourneySortMode(mode)}
                            title={label}
                            aria-label={label}
                            className={
                              active
                                ? "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#f6c86a]/35 bg-[#f6c86a] text-[#0b1020] shadow-[0_14px_30px_-18px_rgba(246,200,106,0.65)]"
                                : "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/88 hover:bg-white/14"
                            }
                          >
                            {getJourneySortIcon(mode, "h-5 w-5")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-[16px] border border-[rgba(246,200,106,0.16)] bg-[var(--geo-navy)] px-2.5 py-1.5 text-white shadow-[0_18px_40px_-28px_rgba(8,18,30,0.85)]">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#f6c86a] whitespace-nowrap">
                      {tUI(languageCode, "classroom.owner.visibility.label")}
                    </span>
                    <div className="flex items-center gap-1">
                      {([
                        ["all", tUI(languageCode, "classroom.owner.visibility.all")],
                        ["public", tUI(languageCode, "classroom.owner.visibility.public")],
                        ["private", tUI(languageCode, "classroom.owner.visibility.private")],
                      ] as const).map(([value, label]) => {
                        const active = journeyVisibilityFilter === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setJourneyVisibilityFilter(value)}
                            title={label}
                            aria-label={label}
                            className={
                              active
                                ? "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#f6c86a]/35 bg-[#f6c86a] text-[#0b1020] shadow-[0_14px_30px_-18px_rgba(246,200,106,0.65)]"
                                : "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/88 hover:bg-white/14"
                            }
                          >
                            {getJourneyVisibilityIcon(value, "h-5 w-5")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid min-h-0 flex-1 gap-5 xl:grid-cols-[1fr_auto_1fr]">
                  <div className="flex min-h-0 flex-col">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-[var(--geo-navy)]">{tUI(languageCode, "classroom.owner.available_journeys")}</h3>
                      <span className="rounded-full border border-[rgba(18,49,78,0.12)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{assignable.length}</span>
                    </div>
                    {journeyLoading ? <p className="text-sm text-slate-600">{tUI(languageCode, "classroom.owner.loading_journeys")}</p> : assignable.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">{journeySearch.trim() ? tUI(languageCode, "classroom.owner.no_match") : tUI(languageCode, "classroom.owner.no_assignable")}</div>
                    ) : (
                      <ul className="max-h-[520px] flex-1 space-y-3 overflow-y-auto pr-1">
                        {assignable.map((journey) => (
                          <li key={journey.journey_id}>
                            <JourneyCatalogCard journey={journey} langCode={languageCode} disabled={journeySaving} onAction={() => handleAssignJourney(journey.journey_id)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="hidden xl:block w-px self-stretch bg-[linear-gradient(180deg,rgba(18,49,78,0.04),rgba(18,49,78,0.16),rgba(18,49,78,0.04))]" />
                  <div className="flex min-h-0 flex-col">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-[var(--geo-navy)]">{tUI(languageCode, "classroom.owner.chosen_journeys")}</h3>
                      <span className="rounded-full border border-[rgba(18,49,78,0.12)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{assigned.length}</span>
                    </div>
                    {journeyLoading ? <p className="text-sm text-slate-600">{tUI(languageCode, "classroom.member.assigned_loading")}</p> : assigned.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">{tUI(languageCode, "classroom.owner.no_assigned")}</div>
                    ) : (
                      <ul className="flex-1 space-y-3 overflow-y-auto pr-1">
                        {assigned.map((item, index) => {
                          const rankingRows = rankingMap[item.group_event_id] || [];
                          return (
                            <li key={item.id}>
                              <AssignedJourneyCard item={item} index={index} total={assigned.length} disabled={journeySaving} rankingCount={rankingRows.length} startedCount={progressCounts[item.group_event_id]?.started || 0} completedCount={progressCounts[item.group_event_id]?.completed || 0} attemptsCount={quizCounts[item.group_event_id]?.attempts || 0} participantsCount={quizCounts[item.group_event_id]?.participants || 0} langCode={languageCode} onMoveUp={() => handleReorder(item.id, -1)} onMoveDown={() => handleReorder(item.id, 1)} onToggleRequired={() => handleToggleRequired(item)} onRemove={() => handleUnassign(item)} />
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </PanelCard>
              </div>
            </div>

          </div>
        )}
      </div>
      {confirmDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_28px_80px_-40px_rgba(16,32,51,0.55)]">
            <h2 className="text-xl font-semibold text-[var(--geo-navy)]">{tUI(languageCode, "classroom.owner.delete_modal.title")}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {tUI(languageCode, "classroom.owner.delete_modal.body")}
            </p>
            {deleteError ? <Notice tone="error">{deleteError}</Notice> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (deleting) return;
                  setConfirmDeleteOpen(false);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {tUI(languageCode, "classroom.owner.delete_modal.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDeleteClassroom}
                disabled={deleting}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? tUI(languageCode, "classroom.owner.delete_modal.deleting") : tUI(languageCode, "classroom.owner.delete_modal.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function JourneyCoverThumb({
  journey,
  langCode,
  sizeClassName,
}: {
  journey: ClassroomJourneyCatalogRow | null | undefined;
  langCode?: string | null;
  sizeClassName?: string;
}) {
  const frameClassName = sizeClassName || "h-16 w-24";
  if (journey?.journey_cover_url) {
    return <img src={journey.journey_cover_url} alt={classroomJourneyTitle(journey)} className={`${frameClassName} rounded-2xl object-cover shadow-sm`} loading="lazy" />;
  }
  return (
    <div className={`flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 ${frameClassName}`}>
      {tUI(langCode, "classroom.owner.no_cover")}
    </div>
  );
}

function getJourneySortIcon(mode: JourneySortMode, className = "h-3.5 w-3.5") {
  if (mode === "timeline") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 12h16" strokeLinecap="round" />
        <path d="M7 8v8" strokeLinecap="round" />
        <path d="M12 6v12" strokeLinecap="round" />
        <path d="M17 9v6" strokeLinecap="round" />
      </svg>
    );
  }
  if (mode === "rating") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
    );
  }
  if (mode === "favourites") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3v3" strokeLinecap="round" />
      <path d="M17 3v3" strokeLinecap="round" />
      <path d="M4 9h16" strokeLinecap="round" />
      <rect x="4" y="5" width="16" height="15" rx="2" />
    </svg>
  );
}

function getJourneyVisibilityIcon(filter: JourneyVisibilityFilter, className = "h-3.5 w-3.5") {
  if (filter === "all") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M4.5 12h15" strokeLinecap="round" />
        <path d="M12 4.5c2.3 2.1 3.5 4.6 3.5 7.5S14.3 17.4 12 19.5c-2.3-2.1-3.5-4.6-3.5-7.5S9.7 6.6 12 4.5Z" />
      </svg>
    );
  }
  if (filter === "public") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M2 12s3.5-5 10-5 10 5 10 5-3.5 5-10 5-10-5-10-5Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8.5A4 4 0 0 1 12 4.5a4 4 0 0 1 4 4V11" />
    </svg>
  );
}

function JourneyMeta({
  journey,
  langCode,
}: {
  journey: ClassroomJourneyCatalogRow | null | undefined;
  langCode?: string | null;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{journey?.events_count ?? "-"} {tUI(langCode, "classroom.owner.events_suffix")}</span>
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{formatClassroomDate(journey?.approved_at, langCode) || tUI(langCode, "classroom.owner.not_published")}</span>
    </div>
  );
}

function JourneyCatalogCard({
  journey,
  langCode,
  disabled,
  onAction,
}: {
  journey: ClassroomJourneyCatalogRow;
  langCode?: string | null;
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[330px] items-end gap-2.5">
      <div className="min-w-0 flex-1">
        <Scorecard
          asListItem={false}
          className="!h-auto"
          coverClassName="aspect-[5/3] !h-auto"
          title={classroomJourneyTitle(journey)}
          coverUrl={journey?.journey_cover_url || null}
          isFavourite={journey?.is_favourite ?? null}
          publishedAt={journey?.approved_at || null}
          averageRating={journey?.avg_rating ?? null}
          ratingsCount={journey?.ratings_count ?? null}
          eventsCount={journey?.events_count ?? null}
          yearFrom={journey?.year_from_min ?? null}
          yearTo={journey?.year_to_max ?? null}
          usePlainImg
        />
      </div>
      <div className="shrink-0">
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          title={tUI(langCode, "classroom.owner.add")}
          aria-label={tUI(langCode, "classroom.owner.add")}
          className="group inline-flex h-10 w-12 items-center justify-center rounded-xl bg-[var(--geo-navy)] text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] transition hover:bg-[#123f66] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M10 4.5v11" />
            <path d="M4.5 10h11" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function AssignedJourneyCard({
  item,
  index,
  total,
  disabled,
  rankingCount,
  startedCount,
  completedCount,
  attemptsCount,
  participantsCount,
  langCode,
  onMoveUp,
  onMoveDown,
  onToggleRequired,
  onRemove,
}: {
  item: ClassroomJourneyAssignmentRow;
  index: number;
  total: number;
  disabled?: boolean;
  rankingCount: number;
  startedCount: number;
  completedCount: number;
  attemptsCount: number;
  participantsCount: number;
  langCode?: string | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleRequired: () => void;
  onRemove: () => void;
}) {
  const completionPct =
    participantsCount > 0
      ? Math.max(0, Math.min(100, Math.round((completedCount / participantsCount) * 100)))
      : 0;
  const completionStyle =
    completionPct <= 0
      ? {
          background: "#ffffff",
          border: "1px solid rgba(18,49,78,0.12)",
          color: "#64748b",
        }
      : completionPct >= 100
        ? {
            background: "#059669",
            border: "1px solid #059669",
            color: "#ffffff",
          }
        : {
            background: `linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(16,185,129,${Math.max(
              0.18,
              completionPct / 100
            ).toFixed(2)}) 100%)`,
            border: "1px solid rgba(16,185,129,0.28)",
            color: "#065f46",
          };

  return (
    <div className="mx-auto w-full max-w-[330px] space-y-2">
      <div className="flex items-end gap-2.5">
        <div className="flex shrink-0 flex-col justify-end gap-1.5">
        <div
          title={tUI(langCode, "classroom.owner.ranking")}
          aria-label={tUI(langCode, "classroom.owner.ranking")}
          className="inline-flex h-10 w-12 items-center justify-center rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-2 text-[var(--geo-navy)] shadow-sm"
        >
          <span className="text-[11px] font-semibold">#{item.sort_order + 1}</span>
        </div>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={disabled || index === 0}
          title={tUI(langCode, "classroom.owner.move_up")}
          aria-label={tUI(langCode, "classroom.owner.move_up")}
          className="inline-flex h-10 w-12 items-center justify-center rounded-xl border border-[rgba(18,49,78,0.12)] bg-white text-[var(--geo-navy)] shadow-sm transition hover:border-[#f6c86a]/35 hover:bg-[#fff8e8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M10 15V5" />
            <path d="M6.5 8.5 10 5l3.5 3.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={disabled || index === total - 1}
          title={tUI(langCode, "classroom.owner.move_down")}
          aria-label={tUI(langCode, "classroom.owner.move_down")}
          className="inline-flex h-10 w-12 items-center justify-center rounded-xl border border-[rgba(18,49,78,0.12)] bg-white text-[var(--geo-navy)] shadow-sm transition hover:border-[#f6c86a]/35 hover:bg-[#fff8e8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M10 5v10" />
            <path d="M6.5 11.5 10 15l3.5-3.5" />
          </svg>
        </button>
        <div
          title={tUI(langCode, "classroom.owner.completed")}
          aria-label={tUI(langCode, "classroom.owner.completed")}
          className="inline-flex h-10 w-12 items-center justify-center rounded-xl px-2 text-center shadow-sm"
          style={completionStyle}
        >
          <span className="text-[10px] font-semibold">{completionPct}%</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          title={tUI(langCode, "classroom.owner.remove")}
          aria-label={tUI(langCode, "classroom.owner.remove")}
          className="group inline-flex h-10 w-12 items-center justify-center rounded-xl bg-rose-600 text-white shadow-[0_14px_30px_-18px_rgba(225,29,72,0.55)] transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M4.5 10h11" />
          </svg>
        </button>
        </div>
        <div className="min-w-0 flex-1">
          <Scorecard
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
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "error" | "info"; children: ReactNode }) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-sky-200 bg-sky-50 text-sky-700";
  return <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

function PanelCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`rounded-[28px] border border-[rgba(246,200,106,0.24)] bg-[linear-gradient(180deg,rgba(18,49,78,0.28),rgba(18,49,78,0.16))] p-6 shadow-[0_22px_48px_-34px_rgba(16,32,51,0.38)] ${className ?? ""}`}>{children}</section>;
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
          <Link href={actionHref} className="rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] hover:bg-[#123f66]">{actionLabel}</Link>
        </div>
      ) : null}
    </div>
  );
}

