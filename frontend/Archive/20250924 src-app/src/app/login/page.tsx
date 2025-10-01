// src/app/login/page.tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseBrowserClient";
import styles from "./login.module.css";

type PersonaInfo = { default_landing_path: string | null; code: string | null };
type ProfileWithPersona = { personas: PersonaInfo | null };

/* ---------------- helpers ---------------- */

// attende che la sessione sia pronta dopo sign-in
async function waitForSessionReady(maxMs = 8000, stepMs = 250) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) return data.session;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error("Sessione non disponibile dopo il login");
}

// normalizza e ritorna SEMPRE /landing/<persona>
function toPersonaLanding(personaCode?: string | null, dbPath?: string | null) {
  const code = (personaCode || "").toLowerCase();
  const p = (dbPath || "").trim().toLowerCase();

  if (p.startsWith("/landing/")) return p;
  if (p === "/student/home" || p.startsWith("/student/") || p === "/dashboard/student") return "/landing/student";
  if (p === "/fan" || p === "/dashboard/enthusiast") return "/landing/enthusiast";
  if (p === "/research" || p === "/dashboard/researcher") return "/landing/researcher";
  if (p === "/dashboard/moderator") return "/landing/moderator";
  if (p === "/dashboard/admin") return "/landing/admin";

  switch (code) {
    case "student":     return "/landing/student";
    case "researcher":  return "/landing/researcher";
    case "moderator":   return "/landing/moderator";
    case "enthusiast":  return "/landing/enthusiast";
    case "admin":       return "/landing/admin";
    default:            return "/landing/student"; // default forte
  }
}

/* ---------------- component ---------------- */

export default function LoginPage() {
  const router = useRouter();

  // form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ui
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // evita redirect multipli
  const redirected = useRef(false);

  const redirectByPersona = useCallback(async () => {
    if (redirected.current) return;
    redirected.current = true;

    try {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;
      if (!user) throw new Error("Utente non autenticato");

      const { data, error } = await supabase
        .from("profiles")
        .select("personas(default_landing_path, code)")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      const prof = (data ?? null) as ProfileWithPersona | null;
      const persona = prof?.personas ?? null;

      const target = toPersonaLanding(persona?.code ?? null, persona?.default_landing_path ?? null);
      router.replace(target);
    } catch (err) {
      redirected.current = false;
      throw err;
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setErrorMsg(null);
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      await waitForSessionReady();
      await redirectByPersona();
    } catch (err: any) {
      setErrorMsg(err?.message || "Login fallito");
      setSubmitting(false); // riabilita il form in caso di errore
    }
  }

  async function oauth(provider: "google" | "apple" | "azure") {
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider });
      if (error) throw error;
      // al ritorno dalla OAuth la pagina verrà ricaricata
    } catch (err: any) {
      setErrorMsg(err?.message || "Accesso social non riuscito");
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.veil} />

      <div className={styles.card}>
        <img src="/logo.png" alt="GeoHistory Journey" className={styles.brandLogo} />

        <p className={styles.tagline}>
          <strong>Where time and space turn into stories</strong>
          A digital space where history, imagination, and discovery meet.
          <br />
          Explore maps, travel through timelines, and bring events to life.
        </p>

        <div className={styles.separator} />

        <h2>Login</h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="you@example.com"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="••••••••"
            />
            <div className={styles.forgot}>
              <Link href="/forgot-password">Password dimenticata?</Link>
            </div>
          </div>

          {errorMsg && (
            <div className={styles.error} role="alert" aria-live="polite">
              {errorMsg}
            </div>
          )}

          <button type="submit" disabled={submitting} className={styles.button}>
            {submitting ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>

        <div className={styles.divider}>
          <span className={styles.line} />
          <span className={styles.divTxt}>OPPURE ACCEDI CON</span>
          <span className={styles.line} />
        </div>

        <div className={styles.socials}>
          <button
            className={styles.socialBtn}
            onClick={() => oauth("google")}
            aria-label="Google"
            disabled={submitting}
          >
            <img className={styles.socialIcon} src="/icons/google.svg" alt="" />
          </button>
          <button
            className={styles.socialBtn}
            onClick={() => oauth("apple")}
            aria-label="Apple"
            disabled={submitting}
          >
            <img className={styles.socialIcon} src="/icons/apple.svg" alt="" />
          </button>
          <button
            className={styles.socialBtn}
            onClick={() => oauth("azure")}
            aria-label="Microsoft"
            disabled={submitting}
          >
            <img className={styles.socialIcon} src="/icons/microsoft.svg" alt="" />
          </button>
        </div>

        <div className={styles.bottom}>
          Non hai un account? <Link href="/register">Registrati</Link>
        </div>
      </div>
    </div>
  );
}
