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

  async function ensureProfileFromAuth(user: any, personaId?: string | null) {
    try {
      if (!user?.id) return;
      const fullName = (user.user_metadata?.full_name || "").trim() || null;
      const firstName = (user.user_metadata?.first_name || "").trim() || null;
      const lastName = (user.user_metadata?.last_name || "").trim() || null;
      const username = (user.user_metadata?.username || user.email || "").trim() || null;
      const payload = {
        id: user.id,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        username,
        persona_id: personaId ?? user.user_metadata?.persona_id ?? null,
      };
      await fetch("/api/register/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // best effort: profile bootstrap
    }
  }

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
        let { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("id, persona_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profErr || !profile) {
          // best-effort bootstrap (e.g. trigger missing or RLS blocked at signup)
          await ensureProfileFromAuth(user);
          const retry = await supabase
            .from("profiles")
            .select("id, persona_id")
            .eq("id", user.id)
            .maybeSingle();
          profile = retry.data ?? null;
          profErr = retry.error ?? null;
        }
        if (profErr || !profile) {
          setState({
            checking: false,
            error: "Profilo non trovato.",
            userId: user.id,
            profile: null,
            persona: null,
            personaCode: "USER",
            isAdminOrMod: false,
          });
          return;
        }

        // 3) Persona (code)
        let persona: Persona | null = null;
        let code = "USER";
        if ((profile as Profile).persona_id) {
          const { data: personaData, error: persErr } = await supabase
            .from("personas")
            .select("id, code")
            .eq("id", (profile as Profile).persona_id)
            .maybeSingle();
          if (!persErr && personaData) {
            persona = personaData as Persona;
            code = (persona?.code ?? "").trim().toUpperCase() || "USER";
          }
        } else if (user.user_metadata?.persona_id) {
          await ensureProfileFromAuth(user, user.user_metadata.persona_id);
        }

        const isPrivileged = code.startsWith("ADMIN") || code.startsWith("MOD");

        setState({
          checking: false,
          error: null,
          userId: user.id,
          profile: profile as Profile,
          persona,
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
