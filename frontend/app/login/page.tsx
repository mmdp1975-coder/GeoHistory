// app/login/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth.module.css";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { User } from "@supabase/supabase-js";

const LANDING_MAP: Record<string, string> = {
  ADMIN: "/landing/ADMIN",
  FAN: "/landing/FAN",
  MOD: "/landing/MOD",
  RESEARCH: "/landing/RESEARCH",
  STUD_HIGH: "/landing/STUD_HIGH",
  STUD_MIDDLE: "/landing/STUD_MIDDLE",
  STUD_PRIMARY: "/landing/STUD_PRIMARY",
};

const FALLBACK_PATHS = [
  "/landing/STUD_PRIMARY",
  "/landing/FAN",
  "/landing/ADMIN",
  "/module/build-journey",
  "/",
];

async function ensureProfile(user: User, supabase: ReturnType<typeof createClientComponentClient>) {
  const { data, error } = await supabase
    .from("profiles")
    .select("persona_id")
    .eq("id", user.id)
    .maybeSingle<{ persona_id: string | null }>();

  if (error) {
    console.warn("[login] profile fetch error", error.message);
    return null;
  }

  if (data) return data.persona_id ? data.persona_id : null;

  const metadata = user.user_metadata || {};
  const payload = {
    id: user.id,
    persona_id: metadata.persona_id ?? null,
  };

  try {
    await fetch("/api/register/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[login] profile hydrate failed", err);
  }

  const { data: refetched } = await supabase
    .from("profiles")
    .select("persona_id")
    .eq("id", user.id)
    .maybeSingle<{ persona_id: string | null }>();

  return refetched?.persona_id ?? null;
}

async function fetchPersona(personaId: string | null, supabase: ReturnType<typeof createClientComponentClient>) {
  if (!personaId) return null;
  const { data, error } = await supabase
    .from("personas")
    .select("default_landing_path, code")
    .eq("id", personaId)
    .maybeSingle<{ default_landing_path: string | null; code: string | null }>();
  if (error) {
    console.warn("[login] persona fetch error", error.message);
    return null;
  }
  return data ?? null;
}

function buildCandidates(defaultLanding?: string | null, personaCode?: string | null): string[] {
  const candidates: string[] = [];
  const norm = (path: string | null | undefined) => {
    if (!path) return null;
    return path.startsWith("/") ? path : `/${path}`;
  };

  const first = norm(defaultLanding);
  if (first) candidates.push(first);

  const code = (personaCode || "").trim();
  if (code) {
    const upper = code.toUpperCase();
    if (LANDING_MAP[upper]) candidates.push(LANDING_MAP[upper]);
  }

  candidates.push(...FALLBACK_PATHS);
  return Array.from(new Set(candidates));
}

async function resolveLanding(user: User, supabase: ReturnType<typeof createClientComponentClient>) {
  const personaId = await ensureProfile(user, supabase);
  const persona = await fetchPersona(personaId, supabase);
  const candidates = buildCandidates(persona?.default_landing_path, persona?.code ?? undefined);
  return pickFirstExisting(candidates);
}

async function pickFirstExisting(paths: string[]): Promise<string> {
  for (const path of paths) {
    try {
      const res = await fetch(path, { method: "HEAD", cache: "no-store" });
      if (res.ok) return path;
    } catch {
      // ignore network errors, try next candidate
    }
  }
  return paths[paths.length - 1] ?? "/";
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwdType = useMemo(() => (showPwd ? "text" : "password"), [showPwd]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Invalid session");

      const target = await resolveLanding(user, supabase);
      router.push(target);
    } catch (err: any) {
      setError(err?.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSocial(provider: "google" | "apple" | "azure") {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err?.message ?? "Social sign-in failed.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.veil} />

      <div className={styles.card}>
        <div className={styles.brandWrap}>
          <Image className={styles.logo} src="/logo.png" alt="GeoHistory Journey" width={220} height={220} priority />
        </div>

        <div className={styles.tagline}>Where time and space turn into stories</div>
        <div className={styles.valueprop}>
          Explore journeys where history, imagination, and discovery blend.<br />
          Unlock maps, events, timelines, and let time guide you to the past
        </div>

        <h1 className={`${styles.title} ${styles.titleAligned}`}>Login</h1>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <div className={styles.label}>Email</div>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@email.com"
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Password</div>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type={pwdType}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
              />
              <button
                type="button"
                aria-label={showPwd ? "Hide password" : "Show password"}
                className={styles.eyeBtn}
                onClick={() => setShowPwd((prev) => !prev)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPwd ? (
                    <>
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-10.94-8" />
                      <path d="M1 1l22 22" />
                      <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {error && <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>}

          <div className={styles.field}>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} disabled={loading} type="submit">
                {loading ? "Signing in..." : "Sign in"}
              </button>

              <div className={styles.links}>
                <Link className={styles.a} href="/login/forgot">Forgot password</Link>
                <Link className={styles.a} href="/login/register">Create an account</Link>
              </div>
            </div>
          </div>
        </form>

        <div className={styles.divider}>or continue with</div>

        <div className={styles.social}>
          <button aria-label="Google" className={styles.iconBtn} onClick={() => handleSocial("google")}>
            <Image src="/icons/google.svg" alt="" width={20} height={20} />
          </button>
          <button aria-label="Apple" className={styles.iconBtn} onClick={() => handleSocial("apple")}>
            <Image src="/icons/apple.svg" alt="" width={20} height={20} />
          </button>
          <button aria-label="Microsoft" className={styles.iconBtn} onClick={() => handleSocial("azure")}>
            <Image src="/icons/microsoft.svg" alt="" width={20} height={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
