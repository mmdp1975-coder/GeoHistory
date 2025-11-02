/**
 * useCurrentUser — hook centralizzato per GeoHistory
 * - Legge utente da Supabase Auth
 * - Carica profiles (persona_id) e personas (code)
 * - Espone flag isAdminOrMod + personaCode, con gestione errori
 *
 * Note:
 * - Nessun JSX qui (file .ts), così evitiamo i classici problemi di parsing TSX.
 * - Da usare dentro componenti "use client".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Persona = { id: string; code: string | null };
type Profile = { id: string; persona_id: string | null };

export type CurrentUserState = {
  checking: boolean;
  error: string | null;

  userId: string | null;

  profile: Pick<Profile, "id" | "persona_id"> | null;
  persona: Pick<Persona, "id" | "code"> | null;

  personaCode: string;              // es. "ADMIN", "MOD", "FAN", etc.
  isAdminOrMod: boolean;            // true se personaCode inizia con ADMIN o MOD
};

export function useCurrentUser(): CurrentUserState {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [state, setState] = useState<CurrentUserState>({
    checking: true,
    error: null,
    userId: null,
    profile: null,
    persona: null,
    personaCode: "",
    isAdminOrMod: false,
  });

  // Evita doppio run in StrictMode dev
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    (async () => {
      try {
        setState((s) => ({ ...s, checking: true, error: null }));

        // 1) Utente corrente
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) {
          setState({
            checking: false,
            error: "Nessuna sessione attiva.",
            userId: null,
            profile: null,
            persona: null,
            personaCode: "",
            isAdminOrMod: false,
          });
          return;
        }

        // 2) Profile (persona_id)
        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("id, persona_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profErr || !profile) {
          setState({
            checking: false,
            error: "Profilo non trovato.",
            userId: user.id,
            profile: null,
            persona: null,
            personaCode: "",
            isAdminOrMod: false,
          });
          return;
        }

        // 3) Persona (code)
        const { data: persona, error: persErr } = await supabase
          .from("personas")
          .select("id, code")
          .eq("id", (profile as Profile).persona_id)
          .maybeSingle();
        if (persErr || !persona) {
          setState({
            checking: false,
            error: "Persona non trovata.",
            userId: user.id,
            profile: profile as Profile,
            persona: null,
            personaCode: "",
            isAdminOrMod: false,
          });
          return;
        }

        const code = (persona?.code ?? "").trim().toUpperCase();
        const isPrivileged = code.startsWith("ADMIN") || code.startsWith("MOD");

        setState({
          checking: false,
          error: null,
          userId: user.id,
          profile: profile as Profile,
          persona: persona as Persona,
          personaCode: code,
          isAdminOrMod: isPrivileged,
        });
      } catch (e: any) {
        setState((s) => ({
          ...s,
          checking: false,
          error: e?.message ?? "Errore durante la verifica utente.",
          isAdminOrMod: false,
        }));
      }
    })();
  }, [supabase]);

  return state;
}
