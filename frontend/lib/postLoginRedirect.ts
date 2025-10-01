// frontend/lib/postLoginRedirect.ts
import { supabase } from "./supabaseBrowserClient";

type PersonaCode = "STUD_PRIMARY" | "STUD_MIDDLE" | "STUD_HIGH" | "FAN" | "RESEARCH";

function codeToSlug(code?: string | null): string | null {
  switch ((code || "").toUpperCase()) {
    case "STUD_PRIMARY":
      return "student-primary";
    case "STUD_MIDDLE":
      return "student-middle";
    case "STUD_HIGH":
      return "student-high";
    case "FAN":
      return "fan";
    case "RESEARCH":
      return "research";
    default:
      return null;
  }
}

/**
 * Restituisce l'URL dove mandare l'utente dopo il login.
 * Priorità:
 * 1) profiles.landing_slug
 * 2) profiles.persona_code (mappato) oppure profiles.persona
 * 3) fallback "/landing"
 */
export default async function postLoginRedirect(): Promise<string> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id ?? null;
    if (!uid) return "/login";

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("landing_slug, persona, persona_code")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.warn("[postLoginRedirect] profile error:", error.message);
      return "/landing";
    }

    const landing = (profile as any)?.landing_slug as string | null;
    if (landing && typeof landing === "string") {
      return `/landing/${landing}`;
    }

    const code = (profile as any)?.persona_code as PersonaCode | null;
    const codeSlug = codeToSlug(code ?? null);
    if (codeSlug) return `/landing/${codeSlug}`;

    const persona = (profile as any)?.persona as string | null;
    if (persona && typeof persona === "string") {
      const slug = persona.trim().toLowerCase().replace(/\s+/g, "-");
      return `/landing/${slug}`;
    }

    return "/landing";
  } catch (e) {
    console.warn("[postLoginRedirect] unexpected:", e);
    return "/landing";
  }
}
