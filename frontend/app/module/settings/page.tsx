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
  language_code: string | null;
  persona_id: string | null;
};

const LANGS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
];

// Privilegiati = qualsiasi code che inizi con ADMIN o MOD (copre varianti)
function isPrivilegedCode(code: string | null | undefined) {
  const u = (code || '').trim().toUpperCase();
  return u.startsWith('ADMIN') || u.startsWith('MOD');
}

// Etichetta localizzata per Persona
function getPersonaLabel(p: Persona | undefined, lang: string | null) {
  if (!p) return 'Persona';
  const isIt = (lang || 'en').toLowerCase().startsWith('it');
  const primary = isIt ? p.name_it : p.name_en;
  const fallback = isIt ? p.name_en : p.name_it;
  return (primary || fallback || p.code || 'Persona');
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

  // ---- home dinamica (fallback su FAN) ----
  const [homeHref, setHomeHref] = useState<string | null>(null);
  const [loadingHome, setLoadingHome] = useState<boolean>(true);

  // ===== CARICAMENTO DATI =====
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      setOk(null);

      // 1) utente
      const { data: { user }, error: uerr } = await supabase.auth.getUser();
      if (uerr) { if (alive) { setError(uerr.message); setLoading(false); } return; }
      if (alive) setUser(user ?? null);

      // 2) profilo
      let prof: Profile | null = null;
      if (user) {
        const { data: profRow, error: perr } = await supabase
          .from('profiles')
          .select('id, language_code, persona_id')
          .eq('id', user.id)
          .single();

        if (perr) {
          if (alive) setError(perr.message);
        } else if (alive && profRow) {
          prof = profRow as Profile;
          setProfile(prof);
        }
      }

      // 3) persona corrente (quella del profilo) — è quella che DEVE vedersi nel campo
      let curr: Persona | null = null;
      if (user && prof?.persona_id) {
        const { data: pRow } = await supabase
          .from('personas')
          .select('id, code, name_it, name_en')
          .eq('id', prof.persona_id)
          .single();
        if (pRow) curr = pRow as Persona;
        setCurrentPersona(curr);
      }

      // 4) tutte le personas per le opzioni di scelta
      const { data: pers, error: persErr } = await supabase
        .from('personas')
        .select('id, code, name_it, name_en')
        .order('code', { ascending: true });

      if (persErr) {
        if (alive) setError(prev => prev ? prev : persErr.message);
      } else if (alive) {
        let list = (pers || []) as Persona[];
        // GARANTISCO che l'opzione corrente sia presente tra le option,
        // così il value della select combacia SEMPRE con una option visibile.
        if (curr && !list.some(px => px.id === curr!.id)) {
          list = [curr, ...list];
        }
        setPersonas(list);
      }

      // 5) home dinamica
      try {
        setLoadingHome(true);
        let href = '/landing/FAN';
        if (curr?.code?.trim()) href = `/landing/${curr.code.trim()}`;
        if (alive) setHomeHref(href);
      } finally {
        if (alive) setLoadingHome(false);
      }

      if (alive) setLoading(false);
    })();

    return () => { alive = false; };
  }, [supabase]);

  // mappa id -> persona
  const personasById = useMemo(() => {
    const m = new Map<string, Persona>();
    personas.forEach(p => m.set(p.id, p));
    return m;
  }, [personas]);

  // È un ruolo privilegiato?
  const isPrivileged = isPrivilegedCode(currentPersona?.code);

  // ===== OPZIONI DEL DROPDOWN =====
  // 1) Mostro SEMPRE la persona corrente come prima opzione (così il value trova la option)
  // 2) Poi aggiungo SOLO le non-privilegiate (nessuna ADMIN/MOD selezionabile)
  const options: Persona[] = useMemo(() => {
    const base = personas.filter(p => !isPrivilegedCode(p.code));
    const result: Persona[] = [];
    if (currentPersona) result.push(currentPersona);
    for (const p of base) {
      if (!currentPersona || p.id !== currentPersona.id) result.push(p);
    }
    return result;
  }, [personas, currentPersona]);

  // ===== SALVATAGGIO =====
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError(null);
    setOk(null);

    try {
      const next = profile.persona_id ? personasById.get(profile.persona_id) : null;
      const nextCode = next?.code || null;

      // Non consentire di salvare su ADMIN/MOD
      if (isPrivilegedCode(nextCode)) {
        throw new Error('Non puoi selezionare ruoli privilegiati (ADMIN o MOD) da questa pagina.');
      }

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

  // valore e stato della select
  // - value è SEMPRE la persona del profilo (così vedi quella associata)
  // - se ADMIN/MOD → select disabilitata (si vede ma non si cambia)
  const selectValue = profile?.persona_id || '';
  const selectDisabled = saving || isPrivileged;

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
              <p className="mt-1 text-xs text-gray-500">Imposta la lingua preferita dell’interfaccia.</p>
            </div>

            {/* Persona */}
            <div>
              <label className="block text-sm font-medium mb-2">Persona</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={selectValue}
                disabled={selectDisabled}
                onChange={(e) =>
                  setProfile(prev => prev ? { ...prev, persona_id: e.target.value } : prev)
                }
              >
                {/* Placeholder solo se manca persona_id (caso non tuo) */}
                {!selectValue && (
                  <option value="">Choose persona…</option>
                )}

                {/* 1) la persona corrente del profilo, SEMPRE visibile in cima */}
                {currentPersona && (
                  <option key={`current-${currentPersona.id}`} value={currentPersona.id}>
                    {getPersonaLabel(currentPersona, profile?.language_code || 'en')}
                  </option>
                )}

                {/* 2) tutte le NON privilegiate (niente ADMIN/MOD selezionabili) */}
                {options
                  .filter(p => !currentPersona || p.id !== currentPersona.id)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {getPersonaLabel(p, profile?.language_code || 'en')}
                    </option>
                  ))}
              </select>

              <p className="mt-1 text-xs text-gray-500">
                {isPrivileged
                  ? 'Il tuo ruolo è amministrativo e non può essere modificato da questa pagina.'
                  : 'Puoi scegliere un’altra persona. I ruoli ADMIN/MOD non sono selezionabili.'}
              </p>
            </div>

            {/* Bottoni */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || isPrivileged}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>

              {/* Cancel: home dinamica */}
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
