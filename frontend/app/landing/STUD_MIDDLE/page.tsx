"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/** --------------------------------------------------------------------
 *  THEME (STUDENT • MIDDLE)
 *  ------------------------------------------------------------------*/
const theme = {
  label: "STUDENT • MIDDLE",
  from: "from-indigo-600",
  via: "via-indigo-500",
  to: "to-indigo-400",
  accent: "text-indigo-200",
};

/** --------------------------------------------------------------------
 *  TIPI (coerenti col DB)
 *  ------------------------------------------------------------------*/
type DbWidget = {
  id: string;                 // uuid
  key?: string | null;
  title: string;
  description?: string | null;
  route?: string | null;
  category?: string | null;
  icon?: string | null;
  status?: string | null;
  sort_order?: number | null; // su widgets
};

type PersonaRow = { id: string; code: string | null };
type ProfileRow = { username: string | null; personas: PersonaRow | null };
type WidgetPersonaRow = { widgets: DbWidget | null };

/** --------------------------------------------------------------------
 *  COMPONENT
 *  ------------------------------------------------------------------*/
export default function StudMiddleLanding() {
  const supabase = createClientComponentClient();

  const [username, setUsername] = useState<string>("Student");
  const [personaId, setPersonaId] = useState<string | null>(null); // UUID
  const [widgets, setWidgets] = useState<DbWidget[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  /** ---------------------------------------------------------------
   *  1) Carico profilo + persona (UUID)
   * --------------------------------------------------------------*/
  useEffect(() => {
    let unsub: (() => void) | undefined;

    const resolveUserAndPersona = async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, personas(id, code)")
        .eq("id", userId)
        .maybeSingle<ProfileRow>();
      if (error) throw error;
      if (data?.username) setUsername(data.username);
      if (data?.personas?.id) setPersonaId(data.personas.id);
    };

    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
            if (s?.user) await resolveUserAndPersona(s.user.id);
          });
          unsub = sub.subscription.unsubscribe;
          return;
        }
        await resolveUserAndPersona(session.user.id);
      } catch (e: any) {
        setErrMsg(e?.message ?? "Unable to load user session.");
      }
    };

    init();
    return () => { if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /** ---------------------------------------------------------------
   *  2) Carico widget (widget_personas → widgets)
   * --------------------------------------------------------------*/
  const loadWidgets = async () => {
    try {
      setLoading(true);
      setErrMsg(null);
      if (!personaId) { setWidgets([]); return; }

      const { data, error } = await supabase
        .from("widget_personas")
        .select("widgets(id, key, title, description, route, category, icon, status, sort_order)")
        .eq("persona_id", personaId)
        .returns<WidgetPersonaRow[]>();
      if (error) throw error;

      const list = (data ?? []).map(r => r.widgets).filter((w): w is DbWidget => !!w);
      list.sort((a, b) => {
        const sa = a.sort_order ?? 9999, sb = b.sort_order ?? 9999;
        if (sa !== sb) return sa - sb;
        return (a.title || "").localeCompare(b.title || "");
      });
      setWidgets(list);
    } catch (e: any) {
      setErrMsg(e?.message ?? "Unable to load widgets.");
      setWidgets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (personaId) loadWidgets(); }, [personaId]); // eslint-disable-line

  /** ---------------------------------------------------------------
   *  Helpers
   * --------------------------------------------------------------*/
  const emptyState = useMemo(() => widgets.length === 0 && !loading && !errMsg, [widgets.length, loading, errMsg]);

  /** ---------------------------------------------------------------
   *  RENDER
   * --------------------------------------------------------------*/
  return (
    <>
      {/* HEADER GRADIENT */}
      <section className="relative isolate">
        <div className={`absolute inset-0 -z-10 bg-gradient-to-b ${theme.from} ${theme.via} ${theme.to}`} />
        <div className="absolute inset-0 -z-10 opacity-20" style={{ backgroundImage: "radial-gradient(white 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="mx-auto max-w-7xl px-4 py-12 text-white">
          <p className="text-xs uppercase opacity-90 tracking-wider">{theme.label}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold leading-tight">Welcome back, {username}!</h1>
        </div>
      </section>

      {/* BODY */}
      <main className="mx-auto max-w-7xl px-4 py-10">
        {errMsg && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errMsg}</div>}

        {loading && (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="animate-pulse">
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 h-12 w-12 rounded-xl bg-slate-200" />
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-slate-100" />
                  <div className="mt-4 h-4 w-24 rounded bg-slate-100" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {emptyState && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            <p className="text-base">No widgets configured for this persona yet.</p>
            <p className="mt-1 text-sm">Ask the admin to link widgets to this persona in <code>widget_personas</code>.</p>
          </div>
        )}

        {!loading && widgets.length > 0 && (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map((w) => {
              const icon = w.icon ?? "🧭";
              const title = w.title ?? "Untitled";
              const subtitle = w.description ?? "";
              const href = w.route ?? "#";

              const Card = (
                <div className="group h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div className="inline-flex size-12 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200 text-2xl">{icon}</div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
                  <div className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${theme.accent}`}>
                    Open
                    <svg viewBox="0 0 24 24" className="size-4"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              );

              return (
                <li key={w.id}>
                  {href && href !== "#" ? <Link href={href} className="block h-full">{Card}</Link> : Card}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
