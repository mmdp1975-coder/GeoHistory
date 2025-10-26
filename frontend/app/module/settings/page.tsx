// frontend/app/module/settings/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
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
  language_code: string | null; // 'it' | 'en' | null
  persona_id: string | null;
};

const LANGS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
];

function isPrivilegedCode(code: string | null | undefined) {
  const u = (code || '').trim().toUpperCase();
  return u.startsWith('ADMIN') || u.startsWith('MOD');
}

export default function SettingsPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  // ---- stato UI ----
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // ---- dati profilo/persona ----
  const [profile, setProfile] = useState<Profile | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [currentPersona, setCurrentPersona] = useState<Persona | null>(null);

  // ---- home dinamica (fallback FAN) ----
  const [homeHref, setHomeHref] = useState<string | null>(null);
  const [loadingHome, setLoadingHome] = useState<boolean>(true);

  // label localizzata per persona
  const personaLabel = useMemo(() => {
    return (p: Persona | undefined, lang: string | null) => {
      if (!p) return 'Persona';
      const isIt = (lang || 'en').toLowerCase().startsWith('it');
      const primary = isIt ? p.name_it : p.name_en;
      const fallback = isIt ? p.name_en : p.name_it;
      return (primary || fallback || p.code || 'Persona');
    };
  }, []);

  // ===== CARICAMENTO =====
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      setOk(null);

      // 1) utente
      const { data: { user }, error: uerr } = await supabase.auth.getUser();
      if (!alive) return;
      if (uerr) { setError(uerr.message); setLoading(false); return; }
      setUser(user ?? null);

      // 2) profilo
      let prof: Profile | null = null;
      if (user) {
        const { data: profRow, error: perr } = await supabase
          .from('profiles')
          .select('id, language_code, persona_id')
          .eq('id', user.id)
          .single();

        if (!alive) return;
        if (perr) {
          setError(perr.message);
        } else if (profRow) {
          prof = profRow as Profile;
          setProfile(prof);
        }
      }

      // 3) persona corrente
      let currPersona: Persona | null = null;
      if (user && prof?.persona_id) {
        const { data: pRow, error: perr2 } = await supabase
          .from('personas')
          .select('id, code, name_it, name_en')
          .eq('id', prof.persona_id)
          .single();

        if (!alive) return;
        if (perr2) {
          setError(prev => prev ? prev : perr2.message);
        } else if (pRow) {
          currPersona = pRow as Persona;
          setCurrentPersona(currPersona);
        }
      }

      // 4) elenco personas (eventuale iniezione della corrente)
      const { data: pers, error: persErr } = await supabase
        .from('personas')
        .select('id, code, name_it, name_en')
        .order('code', { ascending: true });

      if (!alive) return;
      if (persErr) {
        setError(prev => prev ? prev : persErr.message);
      } else {
        let list = (pers || []) as Persona[];
        if (currPersona && !list.some(px => px.id === currPersona!.id)) {
          list = [currPersona, ...list];
        }
        setPersonas(list);
      }

      // 5) home dinamica
      try {
        setLoadingHome(true);
        let href = '/landing/FAN';
        if (currPersona?.code?.trim()) href = `/landing/${currPersona.code.trim()}`;
        setHomeHref(href);
      } finally {
        setLoadingHome(false);
      }

      setLoading(false);
    })();

    return () => { alive = false; };
  }, [supabase]);

  // mappa id -> persona
  const personasById = useMemo(() => {
    const m = new Map<string, Persona>();
    personas.forEach(p => m.set(p.id, p));
    return m;
  }, [personas]);

  // privilegiato?
  const isPrivileged = isPrivilegedCode(currentPersona?.code);

  // opzioni select persona (i non privilegiati non vedono ruoli ADMIN/MOD)
  const filteredPersonas: Persona[] = useMemo(() => {
    if (isPrivileged && currentPersona) return [currentPersona];
    return personas.filter(p => !isPrivilegedCode(p.code));
  }, [isPrivileged, currentPersona, personas]);

  // ===== SALVATAGGIO (senza throw: coerzione del payload) =====
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError(null);
    setOk(null);

    try {
      const currentPersonaId = currentPersona?.id ?? null;
      const uiPersonaId = profile.persona_id ?? null;

      // Se sei ADMIN/MOD → forziamo sempre la persona corrente.
      // Se NON sei privilegiato → accettiamo solo persona NON privilegiata, altrimenti usiamo la corrente.
      let personaIdToSave: string | null;
      if (isPrivileged) {
        personaIdToSave = currentPersonaId;
      } else {
        const target = uiPersonaId ? personasById.get(uiPersonaId) : null;
        const targetPriv = target ? isPrivilegedCode(target.code) : false;
        personaIdToSave = targetPriv ? (currentPersonaId || null) : (uiPersonaId || null);
      }

      const payload = {
        language_code: profile.language_code || null, // lingua sempre salvabile
        persona_id: personaIdToSave,
      };

      const resp = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  // ===== NAV HOME =====
  function goHome() {
    if (!homeHref) return;
    router.push(homeHref);
  }

  // ===== UI =====
  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Caricamento impostazioni…
        <div className="mt-4">
          <button
            type="button"
            onClick={goHome}
            disabled={loadingHome || !homeHref}
            className="rounded-xl border px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Torna alla home
          </button>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-6">
        {error && <div className="mb-4 text-red-600 font-medium">Errore: {error}</div>}
        {!user && <div className="mb-4 text-gray-700">Utente non rilevato.</div>}
        <button
          type="button"
          onClick={goHome}
          disabled={loadingHome || !homeHref}
          className="rounded-xl border px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Torna alla home
        </button>
      </div>
    );
  }

  const selectDisabled = saving || isPrivileged;
  const selectValue =
    isPrivileged
      ? (currentPersona?.id || '')    // ADMIN/MOD: bloccata
      : (profile?.persona_id || '');

  return (
    <div className="min-h-[calc(100vh-0px)] w-full bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl bg-white shadow p-6">
          <h2 className="text-base font-semibold mb-6">Profile preferences</h2>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Lingua */}
            <div>
              <label className="block text-sm font-medium mb-2">Language</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={profile?.language_code ?? ''}
                onChange={(e) => {
                  setOk(null); setError(null);
                  setProfile(prev => prev ? { ...prev, language_code: e.target.value } : prev);
                }}
              >
                <option value="" disabled>Choose language…</option>
                {LANGS.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Imposta la lingua preferita dell’interfaccia.</p>
            </div>

            {/* Persona */}
            <div>
              <label className="block text-sm font-medium mb-2">Persona</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={selectValue}
                disabled={selectDisabled}
                onChange={(e) => {
                  setOk(null); setError(null);
                  setProfile(prev => prev ? { ...prev, persona_id: e.target.value } : prev);
                }}
              >
                <option value="">
                  {isPrivileged
                    ? 'Ruolo amministrativo (non modificabile)'
                    : 'Choose persona…'}
                </option>

                {filteredPersonas.map(p => (
                  <option key={p.id} value={p.id}>
                    {personaLabel(p, profile?.language_code || 'en')}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {isPrivileged
                  ? 'Il tuo ruolo è amministrativo e non può essere modificato da questa pagina.'
                  : 'Scegli il tuo profilo (es. Student, Researcher, Fan…). I ruoli ADMIN/MOD non sono auto-assegnabili.'}
              </p>
            </div>

            {/* Bottoni */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !profile}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>

              <button
                type="button"
                onClick={goHome}
                disabled={loadingHome || !homeHref}
                className="rounded-xl border px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
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
