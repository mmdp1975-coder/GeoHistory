// frontend/app/module/NewJourney/page.tsx
// Server Component: elenco dei Journey approvati, ordinati per approved_at decrescente

import { createClient } from '@/lib/supabaseServerClient';

type GroupEvent = {
  id: string;
  code: string | null;
  slug: string;
  title: string;
  pitch: string | null;
  cover_url: string | null;
  description: string | null;
  visibility: string | null;
  status: string | null;
  is_official: boolean | null;
  color_hex: string | null;
  icon_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  workflow_state: string | null;
  audience_scope: string | null;
  owner_user_ref: string | null;
  owner_profile_id: string | null;
  requested_approval_at: string | null;
  approved_at: string | null;
  approved_by_profile_id: string | null;
  refused_at: string | null;
  refused_by_profile_id: string | null;
  refusal_reason: string | null;
};

/** Type guard: verifica i campi minimi */
function isGroupEvent(obj: unknown): obj is GroupEvent {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['slug'] === 'string' &&
    typeof o['title'] === 'string'
  );
}

async function fetchApprovedGroupEvents(): Promise<GroupEvent[]> {
  const supabase = createClient();

  // Query sui soli approvati, ordinati per approved_at (desc)
  const { data, error } = await supabase
    .from('group_event')
    .select(
      [
        'id',
        'code',
        'slug',
        'title',
        'pitch',
        'cover_url',
        'description',
        'visibility',
        'status',
        'is_official',
        'color_hex',
        'icon_name',
        'created_at',
        'updated_at',
        'workflow_state',
        'audience_scope',
        'owner_user_ref',
        'owner_profile_id',
        'requested_approval_at',
        'approved_at',
        'approved_by_profile_id',
        'refused_at',
        'refused_by_profile_id',
        'refusal_reason',
      ].join(',')
    )
    .not('approved_at', 'is', null)
    .order('approved_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Errore fetch group_event:', error);
    return [];
  }

  // --- Normalizzazione typing robusta ---
  // Evitiamo che TS propaghi GenericStringError[]: trattiamo "data" come unknown
  const raw: unknown = data;
  const arr: unknown[] = Array.isArray(raw) ? raw : [];
  const safe = arr.filter(isGroupEvent);
  return safe;
}

export default async function Page() {
  const list = await fetchApprovedGroupEvents();

  return (
    <div className="px-4 py-6 md:px-8">
      <h1 className="text-2xl font-bold mb-4">New Journeys</h1>

      {list.length === 0 ? (
        <div className="text-sm opacity-70">Nessun Journey approvato al momento.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((g) => (
            <a
              key={g.id}
              href={`/module/group_event?slug=${encodeURIComponent(g.slug)}`}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 hover:bg-neutral-900/70 transition"
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center border border-neutral-700"
                  title={g.icon_name ?? 'journey'}
                >
                  <span className="text-lg">🧭</span>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{g.title}</div>
                  <div className="text-xs opacity-70">
                    {g.approved_at ? new Date(g.approved_at).toLocaleString() : '—'}
                  </div>
                </div>
              </div>

              {g.pitch ? (
                <p className="mt-3 text-sm opacity-80 line-clamp-3">{g.pitch}</p>
              ) : null}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
