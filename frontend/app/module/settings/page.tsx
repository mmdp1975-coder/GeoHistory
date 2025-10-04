// frontend/app/module/settings/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { User } from '@supabase/supabase-js';

type Persona = {
  id: string;
  code: string | null;
  name_it: string | null;
  name_en: string | null;
};

type Profile = {
  id: string;
  language_code: string | null;
  persona_id: string | null;
};

const LANGS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
];

export default function SettingsPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);

  const personaLabel = useMemo(() => {
    return (p: Persona | undefined, lang: string | null) => {
      if (!p) return 'Persona';
      const l = (lang || 'en').startsWith('it') ? 'it' : 'en';
      const label = l === 'it' ? (p.name_it || p.name_en) : (p.name_en || p.name_it);
      return label || p.code || 'Persona';
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      setOk(null);

      const { data: { user }, error: uerr } = await supabase.auth.getUser();
      if (uerr) {
        if (alive) setError(uerr.message);
        setLoading(false);
        return;
      }
      if (!user) {
        router.push('/login');
        return;
      }
      if (alive) setUser(user);

      const { data: prof, error: perr } = await supabase
        .from('profiles')
        .select('id, language_code, persona_id')
        .eq('id', user.id)
        .single();

      if (perr) {
        if (alive) setError(perr.message);
      } else if (alive) {
        setProfile(prof as Profile);
      }

      const { data: pers, error: persErr } = await supabase
        .from('personas')
        .select('id, code, name_it, name_en')
        .order('code', { ascending: true });

      if (persErr) {
        if (alive) setError(persErr.message);
      } else if (alive) {
        setPersonas((pers || []) as Persona[]);
      }

      if (alive) setLoading(false);
    })();

    return () => { alive = false; };
  }, [supabase, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError(null);
    setOk(null);

    try {
      const resp = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language_code: profile.language_code || null,
          persona_id: profile.persona_id || null,
        }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || 'Save failed');
      }

      setOk('Impostazioni salvate correttamente.');
    } catch (err: any) {
      setError(err?.message || 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-600">Caricamento impostazioni…</div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="mb-4 text-red-600 font-medium">Errore: {error}</div>
        <Link href="/landing" className="text-blue-600 underline">Torna alla landing</Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-0px)] w-full bg-gray-50">
      {/* Body (header removed) */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl bg-white shadow p-6">
          <h2 className="text-base font-semibold mb-6">Profile preferences</h2>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Lingua */}
            <div>
              <label className="block text-sm font-medium mb-2">Language</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={profile?.language_code || ''}
                onChange={(e) =>
                  setProfile(prev => prev ? { ...prev, language_code: e.target.value } : prev)
                }
              >
                <option value="" disabled>Choose language…</option>
                {LANGS.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Imposta la lingua preferita dell’interfaccia.
              </p>
            </div>

            {/* Persona */}
            <div>
              <label className="block text-sm font-medium mb-2">Persona</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={profile?.persona_id || ''}
                onChange={(e) =>
                  setProfile(prev => prev ? { ...prev, persona_id: e.target.value } : prev)
                }
              >
                <option value="">Choose persona…</option>
                {personas.map(p => (
                  <option key={p.id} value={p.id}>
                    {personaLabel(p, profile?.language_code || 'en')}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Scegli il tuo profilo (es. Student, Researcher, Fan, Admin…).
              </p>
            </div>

            {/* Bottoni */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              <Link
                href="/landing"
                className="rounded-xl border px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>

            {/* Messaggi */}
            {ok && <div className="text-green-700 text-sm">{ok}</div>}
            {error && <div className="text-red-600 text-sm">{error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}
