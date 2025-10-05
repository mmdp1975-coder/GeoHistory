// frontend/app/module/favourites/page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseBrowserClient";

/* -------- Types -------- */
type AnyObj = Record<string, any>;
type AggRow = { group_event_id: string; favourites_count: number; last_added_at: string | null };
type CardModel = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  addedAt?: string | null;
  count: number;
  mine: boolean;
};

/* -------- Helpers data -------- */
function pickFirst<T = any>(obj: AnyObj, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v as T;
  }
  return undefined;
}
function truncate(v?: string, max = 140): string | undefined {
  if (!v) return undefined;
  return v.length > max ? v.slice(0, max - 1) + "…" : v;
}
function referrerLandingPath(): string | null {
  if (typeof document === "undefined") return null;
  const ref = document.referrer || "";
  try {
    const u = new URL(ref);
    const m = u.pathname.match(/^\/landing\/[^/]+$/i);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

/* -------- Page -------- */
export default function FavouritesPage() {
  const router = useRouter();

  const [cards, setCards] = useState<CardModel[]>([]);
  const [landingHref, setLandingHref] = useState<string>("/landing");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const uid = userData?.user?.id ?? null;

        const fromRef = referrerLandingPath();
        if (fromRef) setLandingHref(fromRef);
        else if (uid) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("landing_slug, persona, persona_code")
            .eq("id", uid)
            .maybeSingle();
          const slug =
            (prof as any)?.landing_slug ??
            (prof as any)?.persona ??
            (prof as any)?.persona_code ??
            null;
          setLandingHref(slug ? `/landing/${slug}` : "/landing");
        } else {
          setLandingHref("/landing");
        }

        const { data: agg, error: aggErr } = await supabase.rpc("get_favourites_all");
        if (aggErr) throw aggErr;
        const rows = (agg ?? []) as AggRow[];
        if (!rows.length) {
          if (active) setCards([]);
          return;
        }

        let mySet = new Set<string>();
        if (uid) {
          const { data: mine, error: mineErr } = await supabase
            .from("group_event_favourites")
            .select("group_event_id")
            .eq("profile_id", uid);
          if (mineErr) throw mineErr;
          mySet = new Set((mine ?? []).map((r: any) => String(r.group_event_id)));
        }

        const ids = rows.map((r) => r.group_event_id);
        const { data: ges, error: geErr } = await supabase
          .from("group_events")
          .select("*")
          .in("id", ids);
        if (geErr) throw geErr;

        const byId = new Map<string, AggRow>(rows.map((r) => [r.group_event_id, r]));
        const mapped: CardModel[] = (ges ?? []).map((raw: AnyObj) => {
          const id = String(raw.id);
          const a = byId.get(id);
          const title =
            pickFirst<string>(raw, ["title", "name"]) ?? `Journey ${id.slice(0, 8)}…`;
          const subtitle =
            pickFirst<string>(raw, ["subtitle", "summary"]) ??
            truncate(pickFirst<string>(raw, ["description"]), 140) ??
            undefined;
          const imageUrl =
            pickFirst<string>(raw, ["cover_image_url", "image_url", "thumbnail_url", "coverUrl"]) ??
            null;

          return {
            id,
            title,
            subtitle,
            imageUrl,
            addedAt: a?.last_added_at ?? null,
            count: a?.favourites_count ?? 0,
            mine: mySet.has(id),
          };
        });

        mapped.sort((a, b) => {
          const ta = a.addedAt ? new Date(a.addedAt).getTime() : 0;
          const tb = b.addedAt ? new Date(b.addedAt).getTime() : 0;
          return tb - ta;
        });

        if (active) setCards(mapped);
      } catch (e: any) {
        if (active) setErr(e?.message ?? "Load error");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function onToggleStar(groupEventId: string, mine: boolean) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      if (!uid) throw new Error("Not authenticated");

      if (mine) {
        const { error } = await supabase
          .from("group_event_favourites")
          .delete()
          .eq("profile_id", uid)
          .eq("group_event_id", groupEventId);
        if (error) throw error;

        setCards((prev) =>
          prev.map((c) =>
            c.id === groupEventId ? { ...c, mine: false, count: Math.max(0, (c.count ?? 0) - 1) } : c
          )
        );
      } else {
        const { error } = await supabase
          .from("group_event_favourites")
          .insert([{ profile_id: uid, group_event_id: groupEventId }]);
        if (error && (error as any).code !== "23505") throw error;

        setCards((prev) =>
          prev.map((c) =>
            c.id === groupEventId ? { ...c, mine: true, count: (c.count ?? 0) + 1 } : c
          )
        );
      }
    } catch (e: any) {
      setErr(e?.message ?? "Toggle error");
    }
  }

  function onOpen(id: string) {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("active_group_event_id", id);
      }
    } catch {}
    router.push(`/module/group_event?gid=${id}`);
  }

  const hasCards = cards.length > 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      {/* Stato */}
      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {!loading && !hasCards && <EmptyState />}

      {/* Grid */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
          : cards.map((c) => (
              <article
                key={c.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative h-40 w-full bg-slate-100">
                  {c.imageUrl ? (
                    <Image
                      src={c.imageUrl}
                      alt={c.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-amber-100 to-slate-100" />
                  )}
                  <button
                    onClick={() => onToggleStar(c.id, c.mine)}
                    className="absolute left-2 top-2 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur transition hover:bg-white"
                    title={c.mine ? "Remove from my favourites" : "Add to my favourites"}
                  >
                    <span aria-hidden className="text-xl" style={{ lineHeight: 1 }}>
                      {c.mine ? "★" : "☆"}
                    </span>
                    <span className="text-xs text-slate-700">{c.count}</span>
                  </button>
                </div>

                <div className="space-y-2 p-4">
                  <h2 className="line-clamp-2 text-base font-semibold leading-tight text-slate-900">
                    <button
                      onClick={() => onOpen(c.id)}
                      className="text-left underline-offset-2 hover:underline"
                      title="Open Journey"
                    >
                      {c.title}
                    </button>
                  </h2>
                  {c.subtitle && <p className="line-clamp-3 text-sm text-slate-600">{c.subtitle}</p>}
                  {c.addedAt && (
                    <p className="pt-1 text-xs text-slate-500">
                      Last added {new Date(c.addedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                  <button
                    onClick={() => onOpen(c.id)}
                    className="rounded-lg border px-3 py-1 transition hover:bg-slate-50"
                    title="Open Journey"
                  >
                    Open
                  </button>
                  <Link
                    href={`/share/journey/${c.id}`}
                    className="text-slate-600 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500"
                  >
                    Share
                  </Link>
                </div>
              </article>
            ))}
      </section>
    </main>
  );
}

/* ---------- Helpers UI ---------- */
function EmptyState() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-to-br from-amber-200 to-amber-100" />
      <h3 className="mb-1 text-lg font-semibold">No favourites yet</h3>
      <p className="mb-4 text-sm text-slate-600">
        Quando i profili aggiungono preferiti, appariranno qui.
      </p>
      <Link
        href="/explore"
        className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm transition hover:bg-slate-50"
      >
        Explore Journeys
      </Link>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-40 w-full animate-pulse bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="border-t p-3">
        <div className="h-8 w-20 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}
