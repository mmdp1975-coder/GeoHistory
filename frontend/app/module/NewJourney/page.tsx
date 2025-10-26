// frontend/app/module/NewJourney/page.tsx
// Server Component: mostra i Journeys pubblici pubblicati, ordinati per approved_at decrescente

import { createClient } from '@/lib/supabaseServerClient';

type Journey = {
  id: string;
  slug: string;
  title: string;
  pitch: string | null;
  cover_url: string | null;
  approved_at: string | null; // nella view è sempre valorizzato, ma manteniamo il tipo prudente
};

function isJourney(obj: unknown): obj is Journey {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['slug'] === 'string' &&
    typeof o['title'] === 'string'
  );
}

async function fetchNewJourneys(): Promise<Journey[]> {
  const supabase = createClient();

  // Usiamo la vista pubblica già filtrata (published + visibility=public)
  const { data, error } = await supabase
    .from('v_journeys_public')
    .select('id, slug, title, pitch, cover_url, approved_at')
    .order('approved_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Errore fetch v_journeys_public:', error);
    return [];
  }

  const raw: unknown = data;
  const arr: unknown[] = Array.isArray(raw) ? raw : [];
  return arr.filter(isJourney);
}

export default async function Page() {
  const list = await fetchNewJourneys();

  return (
    <div className="px-4 py-6 md:px-8">
      <h1 className="text-2xl font-bold mb-4">New Journeys</h1>

      {list.length === 0 ? (
        <div className="text-sm opacity-70">Nessun Journey pubblicato al momento.</div>
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
                  title="journey"
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
