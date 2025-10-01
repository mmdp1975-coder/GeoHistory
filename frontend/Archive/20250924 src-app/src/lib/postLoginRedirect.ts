// src/lib/postLoginRedirect.ts

export type PersonaInfo = {
  code?: string | null;
  default_landing_path?: string | null;
};

/* =========================================================
   1) Mappa delle rotte legacy  →  nuove landing
   ⮕ Sostituisci i valori di DESTRA con i TUOI percorsi nuovi.
   Esempio: se la tua nuova landing studenti è /student/dashboard,
   metti "/student/dashboard".
   ========================================================= */
const LEGACY_TO_NEW: Record<string, string> = {
  "/student": "/student/home",
  "/students": "/student/home",
  "/student/primary": "/student/home",
  "/students/primary": "/student/home",
  "/student-elementary": "/student/home",
};

/* =========================================================
   2) Fallback per codice persona  →  landing nuova
   ⮕ Sostituisci i valori di DESTRA con i TUOI percorsi nuovi.
   ========================================================= */
const FALLBACK_BY_CODE: Record<string, string> = {
  student_elementary: "/student/home",
  student_middle: "/student/home",
  student_high: "/student/home",
  student: "/student/home",
  researcher: "/researcher/home",
  enthusiast: "/enthusiast/home",
  moderator: "/moderator/home",
  admin: "/admin/home",
};

/* ---- utils ---- */
function normalizePath(p: string) {
  const t = p.trim();
  return t.startsWith("/") ? t : `/${t}`;
}
function migrateLegacyPath(p: string) {
  const key = p.trim().replace(/\/+$/, ""); // rimuove "/" finale
  if (LEGACY_TO_NEW[key]) return LEGACY_TO_NEW[key];
  return p;
}

/* =========================================================
   computeLandingPath
   - Usa prima la path dal DB (profiles → personas.default_landing_path)
   - Se è legacy, la migra alla nuova
   - Se è vuota, usa il fallback per codice persona
   - Normalizza sempre con "/" iniziale
   ========================================================= */
export function computeLandingPath(persona: PersonaInfo | null | undefined): string {
  const rawDb = (persona?.default_landing_path ?? "").trim();
  const code = (persona?.code ?? "").trim().toLowerCase();

  if (rawDb) {
    const migrated = migrateLegacyPath(rawDb);
    return normalizePath(migrated);
  }

  const fb = code && FALLBACK_BY_CODE[code] ? FALLBACK_BY_CODE[code] : "/explorer";
  return normalizePath(fb);
}

/* =========================================================
   Nota operativa:
   - Aggiorna LEGACY_TO_NEW e FALLBACK_BY_CODE con i TUOI path reali.
   - Questo file è riusabile ovunque (login, middleware, ecc.).
   ========================================================= */
