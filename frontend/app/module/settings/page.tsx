"use client";

/**
 * Settings — usa l’hook centralizzato useCurrentUser()
 * - Niente più auth.getUser/joins duplicati: l’hook fornisce userId, personaCode, isAdminOrMod, profili base
 * - Qui recuperiamo solo ciò che serve in più (language_code, is_admin) e l’elenco personas
 * - Logica di salvataggio invariata (POST /api/profile/update)
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useCurrentUser } from "@/lib/useCurrentUser";

type Persona = {
  id: string;
  code: string | null;
  name_it: string | null;
  name_en: string | null;
};

type ProfileRow = {
  id: string;
  language_code: string | null; // 'it' | 'en' | null
  persona_id: string | null;
  is_admin: boolean | null;
};

const LANGS = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
];

function isPrivilegedCode(code: string | null | undefined) {
  const u = (code || "").trim().toUpperCase();
  return u.startsWith("ADMIN") || u.startsWith("MOD");
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  // 🔸 Stato auth centralizzato (hook)
  const { checking, error: authError, userId, persona, personaCode, isAdminOrMod } = useCurrentUser();

  // ---- stato UI ----
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // ---- dati profilo/persona ----
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);

  // ---- home dinamica (fallback FAN) ----
  const [homeHref, setHomeHref] = useState<string | null>(null);
  const [loadingHome, setLoadingHome] = useState<boolean>(true);

  // label localizzata per persona
  const personaLabel = useMemo(() => {
    return (p: Persona | undefined, lang: string | null) => {
      if (!p) return "Persona";
      const isIt = (lang || "en").toLowerCase().startsWith("it");
      const primary = isIt ? p.name_it : p.name_en;
      const fallback = isIt ? p.name_en : p.name_it;
      return primary || fallback || p.code || "Persona";
    };
  }, []);

  // ===== CARICAMENTO =====
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setOk(null);

        // 0) attesa hook — se non c’è sessione, esco pulito
        if (checking) return;

        if (authError || !userId) {
          if (!alive) return;
          setError(authError || "Utente non rilevato.");
          setLoading(false);
          return;
        }

        // 1) profilo (qui prendiamo anche language_code e is_admin)
        let prof: ProfileRow | null = null;
        {
          const { data: profRow, error: perr } = await supabase
            .from("profiles")
            .select("id, language_code, persona_id, is_admin")
            .eq("id", userId)
            .maybeSingle();

          if (!alive) return;
          if (perr) {
            setError(perr.message);
          } else if (profRow) {
            prof = profRow as ProfileRow;
            setProfile(prof);
          } else {
            setError("Profilo non trovato.");
          }
        }

        // 2) elenco personas (per select)
        {
          const { data: pers, error: persErr } = await supabase
            .from("personas")
            .select("id, code, name_it, name_en")
            .order("code", { ascending: true });

          if (!alive) return;
          if (persErr) {
            setError((prev) => (prev ? prev : persErr.message));
          } else {
            setPersonas((pers || []) as Persona[]);
          }
        }

        // 3) home dinamica
        {
          try {
            setLoadingHome(true);
            let href = "/landing/FAN";
            if (personaCode?.trim()) href = `/landing/${personaCode.trim()}`;
            setHomeHref(href);
          } finally {
            setLoadingHome(false);
          }
        }
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [checking, authError, userId, personaCode, supabase]);

  // mappa id -> persona
  const personasById = useMemo(() => {
    const m = new Map<string, Persona>();
    personas.forEach((p) => m.set(p.id, p));
    return m;
  }, [personas]);

  // privilegiato per la gestione persona (persona ADMIN/MOD o isAdminOrMod dall’hook)
  const isPrivileged = isAdminOrMod || isPrivilegedCode(personaCode);

  // flag admin basato su profiles.is_admin (per il bottone DB_Manager)
  const isAdminProfile = !!profile?.is_admin;

  // opzioni select persona (i non privilegiati non vedono ruoli ADMIN/MOD)
  const filteredPersonas: Persona[] = useMemo(() => {
    if (isPrivileged && persona) return [persona as Persona]; // blocco su ruolo corrente
    return personas.filter((p) => !isPrivilegedCode(p.code));
  }, [isPrivileged, persona, personas]);

  // ===== SALVATAGGIO =====
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !userId) return;

    setSaving(true);
    setError(null);
    setOk(null);

    try {
      const currentPersonaId = persona?.id ?? null; // ruolo già risolto dall’hook
      const uiPersonaId = profile.persona_id ?? null;

      // Se sei ADMIN/MOD → forziamo sempre la persona corrente.
      // Se NON sei privilegiato → accettiamo solo persona NON privilegiata, altrimenti usiamo la corrente.
      let personaIdToSave: string | null;
      if (isPrivileged) {
        personaIdToSave = currentPersonaId;
      } else {
        const target = uiPersonaId ? personasById.get(uiPersonaId) : null;
        const targetPriv = target ? isPrivilegedCode(target.code) : false;
        personaIdToSave = targetPriv ? currentPersonaId : uiPersonaId;
      }

      const payload = {
        language_code: profile.language_code || null,
        persona_id: personaIdToSave,
        // ⚠️ is_admin NON viene modificato da questa pagina
      };

      const resp = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || "Save failed");
      }

      setOk("Impostazioni salvate correttamente.");
    } catch (err: any) {
      setError(err?.message || "Errore salvataggio");
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
  if (checking || loading) {
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

  if (authError || !userId) {
    return (
      <div className="p-6">
        {authError && <div className="mb-4 text-red-600 font-medium">Errore: {authError}</div>}
        {!userId && <div className="mb-4 text-gray-700">Utente non rilevato.</div>}
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
  const selectValue = isPrivileged ? (persona?.id || "") : (profile?.persona_id || "");

  return (
    <div className="min-h-[calc(100vh-0px)] w-full bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl bg-white shadow p-6">
          <h2 className="text-base font-semibold mb-6">Profile preferences</h2>

          {/* 🔥 BOTTONI ADMIN (solo se profiles.is_admin = true) */}
          {isAdminProfile && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => router.push("/module/DB_Manager")}
                className="rounded-xl bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
              >
                Open DB Manager
              </button>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            {/* Lingua */}
            <div>
              <label className="block text-sm font-medium mb-2">Language</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={profile?.language_code ?? ""}
                onChange={(e) => {
                  setOk(null);
                  setError(null);
                  setProfile((prev) => (prev ? { ...prev, language_code: e.target.value } : prev));
                }}
              >
                <option value="" disabled>
                  Choose language…
                </option>
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
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
                  setOk(null);
                  setError(null);
                  setProfile((prev) => (prev ? { ...prev, persona_id: e.target.value } : prev));
                }}
              >
                <option value="">
                  {isPrivileged
                    ? "Ruolo amministrativo (non modificabile)"
                    : "Choose persona…"}
                </option>

                {filteredPersonas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personaLabel(p, profile?.language_code || "en")}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {isPrivileged
                  ? "Il tuo ruolo è amministrativo e non può essere modificato da questa pagina."
                  : "Scegli il tuo profilo (es. Student, Researcher, Fan…). I ruoli ADMIN/MOD non sono auto-assegnabili."}
              </p>
            </div>

            {/* Bottoni */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !profile}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save settings"}
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
            {(error || authError) && (
              <div className="text-red-600 text-sm">{error || authError}</div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
