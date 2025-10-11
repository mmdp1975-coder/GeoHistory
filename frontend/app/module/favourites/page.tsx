// frontend/app/module/favourites/page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseBrowserClient";
import RatingSummary from "../../components/RatingSummary"; // ⬅️ NEW

/** === Config percorso Timeline ===
 * Se la tua Timeline ha un path diverso, cambia qui.
 */
const TIMELINE_PATH = "/module/timeline";

/* -------- Types -------- */
type AnyObj = Record<string, any>;
type CardModel = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  addedAt?: string | null;
  mine: boolean; // in questa pagina è sempre true
};

/* -------- Helpers -------- */
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

/* -------- UI: Heart Icon -------- */
function HeartIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path
          className="text-red-500"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41 1.01 4.22 2.53C12.09 5.01 13.76 4 15.5 4 18 4 20 6 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      </svg>
    );
  }
  return null;
}

/* -------- Page -------- */
export default function FavouritesPage() {
  const router = useRouter();

  const [cards, setCards] = useState<CardModel[]>([]);
  const [landingHref, setLandingHref] = useState<string>("/landing");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // Auth
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const myUid = userData?.user?.id ?? null;
        setUid(myUid);

        // Landing
        const fromRef = referrerLandingPath();
        if (fromRef) setLandingHref(fromRef);
        else if (myUid) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("landing_slug, persona, persona_code")
            .eq("id", myUid)
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

        // Non loggato: niente preferiti
        if (!myUid) {
          if (active) setCards([]);
          return;
        }

        // === SOLO I MIEI PREFERITI ===
        const { data: favRows, error: favErr } = await supabase
          .from("group_event_favourites")
          .select("group_event_id, created_at")
          .eq("profile_id", myUid);
        if (favErr) throw favErr;

        const ids = (favRows ?? []).map((r: any) => r.group_event_id);
        if (!ids.length) {
          if (active) setCards([]);
          return;
        }

        // Group events
        const { data: ges, error: geErr } = await supabase
          .from("group_events")
          .select("*")
          .in("id", ids);
        if (geErr) throw geErr;

        const createdMap = new Map<string, string | null>();
        (favRows ?? []).forEach((r: any) => createdMap.set(String(r.group_event_id), r.created_at ?? null));

        const mapped: CardModel[] = (ges ?? []).map((raw: AnyObj) => {
          const id = String(raw.id);
          const title = pickFirst<string>(raw, ["title", "name"]) ?? `Journey ${id.slice(0, 8)}…`;
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
            addedAt: createdMap.get(id) ?? null,
            mine: true,
          };
        });

        mapped.sort((a, b) => {
          const ta = a.addedAt ? new Date(a.addedAt).getTime() : 0;
          const tb = b.addedAt ? new Date(b.addedAt).getTime() : 0;
          if (tb !== ta) return tb - ta;
          return a.title.localeCompare(b.title);
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

  // Toggle: qui serve solo a rimuovere (unfavourite) e nascondere la card
  async function onToggleHeart(groupEventId: string) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const myUid = userData?.user?.id ?? null;
      if (!myUid) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("group_event_favourites")
        .delete()
        .eq("profile_id", myUid)
        .eq("group_event_id", groupEventId);
      if (error) throw error;

      setCards((prev) => prev.filter((c) => c.id !== groupEventId));
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

      {!loading && !uid && <NotLogged landingHref={landingHref} />}

      {!loading && uid && !hasCards && <EmptyState />}

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

                  {/* Cuore: sempre pieno */}
                  <button
                    onClick={() => onToggleHeart(c.id)}
                    className="absolute left-2 top-2 inline-flex items-center rounded-full bg-white/90 p-2 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur transition hover:bg-white"
                    title="Rimuovi dai miei preferiti"
                    aria-pressed={true}
                  >
                    <HeartIcon filled={true} />
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
                      Added {new Date(c.addedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Footer: Open • RatingSummary • Share */}
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                  <button
                    onClick={() => onOpen(c.id)}
                    className="rounded-lg border px-3 py-1 transition hover:bg-slate-50"
                    title="Open Journey"
                  >
                    Open
                  </button>

                  {/* ⬇️ media • conteggio */}
                  <RatingSummary groupEventId={c.id} />

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

/* ---------- UI helpers ---------- */
function NotLogged({ landingHref }: { landingHref: string }) {
  return (
    <div className="mx-auto mb-6 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900 shadow-sm">
      <h3 className="mb-1 text-lg font-semibold">Accedi per vedere i tuoi preferiti</h3>
      <p className="mb-4 text-sm">
        I preferiti sono legati al tuo profilo. Entra per ritrovarli su qualsiasi dispositivo.
      </p>
      <Link
        href={landingHref || "/landing"}
        className="inline-flex items-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm transition hover:bg-amber-50"
      >
        Vai alla pagina iniziale
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-to-br from-rose-200 to-rose-100" />
      <h3 className="mb-1 text-lg font-semibold">No favourites yet</h3>
      <p className="mb-4 text-sm text-slate-600">
        Aggiungi ai preferiti (cuore) i tuoi Group Event: appariranno qui. Puoi cercarli dalla Timeline.
      </p>
      <Link
        href={TIMELINE_PATH}
        className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm transition hover:bg-slate-50"
      >
        Open Timeline
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
