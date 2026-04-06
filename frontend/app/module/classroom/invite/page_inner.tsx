"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeRedirectPath } from "@/lib/authRedirect";
import { tUI } from "@/lib/i18n/uiLabels";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ClassroomInviteLanding, ClassroomJoinResult } from "../types";
import {
  classroomAccessModeLabel,
  classroomStatusLabel,
  formatClassroomDate,
  normalizeClassroomError,
} from "../utils";

export default function ClassroomInviteLandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { checking, userId, profile, error: authError, languageCode } = useCurrentUser();

  const token = (searchParams.get("token") || "").trim();

  const [invite, setInvite] = useState<ClassroomInviteLanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinInfo, setJoinInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setInvite(null);
      setLoading(false);
      setError(tUI(languageCode, "classroom.invite.unavailable.message"));
      return;
    }

    let active = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: resolveError } = await supabase.rpc(
          "classroom_resolve_active_invite",
          { p_token: token }
        );

        if (!active) return;
        if (resolveError) throw resolveError;

        const resolved = Array.isArray(data) ? data[0] : null;
        if (!resolved) {
          setInvite(null);
          setError(tUI(languageCode, "classroom.invite.unavailable.message"));
          return;
        }

        setInvite(resolved as ClassroomInviteLanding);
      } catch (err) {
        if (!active) return;
        setInvite(null);
        setError(normalizeClassroomError(err, languageCode));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token, supabase]);

  const continuationPath = useMemo(
    () => normalizeRedirectPath(`/module/classroom/invite?token=${encodeURIComponent(token)}`),
    [token]
  );

  async function handleJoin() {
    if (!token || !userId || !profile?.id) return;
    setJoining(true);
    setError(null);
    setJoinInfo(null);
    try {
      const { data, error: joinError } = await supabase.rpc("join_classroom_by_token", {
        p_token: token,
      });

      if (joinError) throw joinError;
      const result = Array.isArray(data) ? (data[0] as ClassroomJoinResult | undefined) : undefined;
      if (!result?.classroom_id) {
        throw new Error("Join did not return a classroom destination.");
      }

      if (result.is_owner) {
        router.replace(`/module/classroom/${encodeURIComponent(result.classroom_id)}`);
        return;
      }

      const status = result.joined ? "joined" : result.already_member ? "existing" : "joined";
      router.replace(
        `/module/classroom/${encodeURIComponent(result.classroom_id)}/member?status=${status}`
      );
    } catch (err) {
      setError(normalizeClassroomError(err, languageCode));
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-74px)] bg-[linear-gradient(180deg,#f4f7fb_0%,#f8f3e8_100%)]">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--geo-navy)]">
            {tUI(languageCode, "classroom.invite.page.title")}
          </h1>
        </div>

        <section className="rounded-[28px] border border-[rgba(246,200,106,0.28)] bg-white p-6 shadow-[0_22px_48px_-34px_rgba(16,32,51,0.38)]">
          {loading || checking ? (
            <p className="text-sm text-slate-600">{tUI(languageCode, "classroom.invite.loading")}</p>
          ) : error || !invite ? (
            <StateMessage
              title={tUI(languageCode, "classroom.invite.unavailable.title")}
              message={error || tUI(languageCode, "classroom.invite.unavailable.message")}
            />
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--geo-navy)]">
                  {invite.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {invite.description || tUI(languageCode, "classroom.invite.description_empty")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#f6c86a]/40 bg-[#f6c86a]/18 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8d6700]">
                  {classroomAccessModeLabel(invite.access_mode, languageCode)}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  {classroomStatusLabel(invite.status, languageCode)}
                </span>
              </div>

              <dl className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start justify-between gap-4">
                  <dt className="font-medium text-slate-800">{tUI(languageCode, "classroom.invite.meta.type")}</dt>
                  <dd>{invite.invite_type}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="font-medium text-slate-800">{tUI(languageCode, "classroom.invite.meta.created")}</dt>
                  <dd>{formatClassroomDate(invite.created_at, languageCode)}</dd>
                </div>
              </dl>

              <div className="rounded-2xl border border-[rgba(246,200,106,0.28)] bg-[#fff8e8] px-4 py-4 text-sm text-slate-700">
                <p>
                  {tUI(languageCode, "classroom.invite.gating")}
                </p>
              </div>

              {joinInfo ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  {joinInfo}
                </div>
              ) : null}

              {authError || !userId ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[rgba(246,200,106,0.28)] bg-[#fff8e8] px-4 py-4 text-sm text-slate-700">
                    {tUI(languageCode, "classroom.invite.auth.prompt")}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/login?redirectTo=${encodeURIComponent(continuationPath || "/module/classroom/invite")}`}
                      className="rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] hover:bg-[#123f66]"
                    >
                      {tUI(languageCode, "classroom.auth.login")}
                    </Link>
                    <Link
                      href={`/login/register?redirectTo=${encodeURIComponent(continuationPath || "/module/classroom/invite")}`}
                      className="rounded-xl border border-[rgba(18,49,78,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--geo-navy)] shadow-sm hover:border-[#f6c86a]/35 hover:bg-[#fff8e8]"
                    >
                      {tUI(languageCode, "classroom.invite.auth.register")}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[rgba(246,200,106,0.28)] bg-[#fff8e8] px-4 py-4 text-sm text-slate-700">
                    {tUI(languageCode, "classroom.invite.join.prompt")}
                  </div>

                  {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={joining}
                    className="rounded-xl bg-[var(--geo-navy)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(246,200,106,0.35)] transition hover:bg-[#123f66] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {joining ? tUI(languageCode, "classroom.invite.join.loading") : tUI(languageCode, "classroom.invite.join.cta")}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StateMessage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--geo-navy)]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
    </div>
  );
}
