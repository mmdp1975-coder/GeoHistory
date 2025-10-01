// lib/postLoginRedirect.ts
import supabase from "./supabaseBrowserClient";

type PersonaCode = "STUD_PRIMARY" | "STUD_MIDDLE" | "STUD_HIGH" | "FAN" | "RESEARCH";

const PATH_BY_CODE: Record<PersonaCode, string> = {
  STUD_PRIMARY: "/landing/STUD_PRIMARY",
  STUD_MIDDLE:  "/landing/STUD_MIDDLE",
  STUD_HIGH:    "/landing/STUD_HIGH",
  FAN:          "/landing/FAN",
  RESEARCH:     "/landing/RESEARCH",
};

function sanitizePath(code: PersonaCode | undefined, raw: string | null | undefined): string {
  // Non valido: vuoto, "/landing" secco, o non prefisso /landing/
  const bad = !raw || raw.trim() === "" || raw.trim() === "/landing" || !raw.startsWith("/landing/");
  if (bad) {
    if (code && code in PATH_BY_CODE) return PATH_BY_CODE[code];
    return "/landing/FAN";
  }
  return raw!;
}

export async function resolvePostLoginPath(): Promise<string> {
  // 1) Utente
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return "/login";

  // 2) persona_id dal profilo
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("persona_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    console.log("[GeHiJ] profiles error →", profErr);
    return "/landing/FAN";
  }
  const personaId = (prof as any)?.persona_id;
  if (!personaId) {
    console.log("[GeHiJ] persona_id assente");
    return "/landing/FAN";
  }

  // 3) persona (code, default_landing_path)
  const { data: persona, error: persErr } = await supabase
    .from("personas")
    .select("code, default_landing_path")
    .eq("id", personaId)
    .maybeSingle();

  if (persErr) {
    console.log("[GeHiJ] personas error →", persErr);
    return "/landing/FAN";
  }

  const code = (persona as any)?.code as PersonaCode | undefined;
  const raw = (persona as any)?.default_landing_path as string | null | undefined;
  const path = sanitizePath(code, raw);

  console.log("[GeHiJ] redirect:", { email: user.email, personaId, code, raw_default: raw, final: path });
  return path;
}

export default resolvePostLoginPath;
