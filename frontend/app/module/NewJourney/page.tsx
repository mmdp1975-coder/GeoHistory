/* app/module/NewJourney/page.tsx
 * GeoHistory — New Journeys (ordine per approved_at DESC)
 * Tabella: group_events (PLURALE)
 * Mostra SOLO i Journey pubblicati (approved_at non null), ordinati per approved_at decrescente.
 * Niente rating. UI pulita con card.
 */

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 0;

type GroupEvent = {
  id: string;
  code: string | null;
  slug: string | null;
  title: string | null;
  pitch: string | null;
  cover_url: string | null;
  description: string | null;
  visibility: string | null;
  status: string | null;
  is_official: boolean | null;
  owner_user_ref: string | null;
  color_hex: string | null;
  icon_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  workflow_state: string | null;
  audience_scope: string | null;
  owner_profile_id: string | null;
  requested_approval_at: string | null;
  approved_at: string | null;
  approved_by_profile_id: string | null;
  refused_at: string | null;
  refused_by_profile_id: string | null;
  refusal_reason: string | null;
};

function pickTitle(ge: GroupEvent) {
  return (
    ge.title ??
    ge.slug ??
    (ge.code ? `Journey ${ge.code}` : null) ??
    `Journey ${ge.id?.toString()?.slice(0, 8) ?? ""}`
  );
}

export default async function Page() {
  const supabase = createServerComponentClient({ cookies });

  // 1) Prendo SOLO i journey pubblicati (approved_at non null) e li ordino per approved_at DESC
  const { data, error } = await supabase
    .from("group_events")
    .select(
      [
        "id",
        "code",
        "slug",
        "title",
        "pitch",
        "cover_url",
        "approved_at",
        "status",
        "workflow_state",
        "icon_name",
        "color_hex",
      ].join(",")
    )
    .not("approved_at", "is", null)
    .order("approved_at", { ascending: false });

  if (error) {
    return (
      <div className="px-4 py-6 md:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">New Journeys</h1>
        <div className="mt-4 rounded-2xl p-6 text-red-600 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="font-medium">Errore nel caricamento dei Journey approvati.</p>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-red-700/90">
            {error.message}
          </pre>
        </div>
      </div>
    );
  }

  const list: GroupEvent[] = (data ?? []) as GroupEvent[];

  return (
    <div className="px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">New Journeys</h1>

      {list.length === 0 ? (
        <div className="mt-4 rounded-2xl p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-base">Nessun Journey pubblicato (approved) al momento.</p>
        </div>
      ) : (
        <ul
          className="
            mt-5 grid gap-5
            sm:grid-cols-2
            lg:grid-cols-3
            2xl:grid-cols-4
          "
        >
          {list.map((ge) => {
            const title = pickTitle(ge);
            const approvedAt = ge.approved_at ? new Date(ge.approved_at) : null;

            return (
              <li key={ge.id}>
                <Link
                  href={`/module/group_event?gid=${encodeURIComponent(ge.id)}`}
                  className="block overflow-hidden rounded-2xl bg-white no-underline shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-zinc-900"
                >
                  {/* Cover */}
                  <div className="relative h-40 w-full">
                    {ge.cover_url ? (
                      <Image
                        src={ge.cover_url}
                        alt={title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        priority={false}
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-zinc-800 dark:to-zinc-700" />
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    <h3 className="line-clamp-2 text-lg font-semibold">{title}</h3>

                    {ge.pitch && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {ge.pitch}
                      </p>
                    )}

                    <div className="mt-3 flex items-center text-xs text-muted-foreground">
                      {approvedAt && (
                        <span>
                          Pubblicato:&nbsp;
                          {approvedAt.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "2-digit",
                          })}
                        </span>
                      )}
                      {(ge.status || ge.workflow_state) && (
                        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 dark:bg-zinc-800">
                          {ge.status ?? ge.workflow_state}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
