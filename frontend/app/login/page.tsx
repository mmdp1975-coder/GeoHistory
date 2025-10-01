// app/login/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth.module.css";

/* === Usare sempre lo stesso client: auth-helpers (gestisce sessione/cookie) === */
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/** Mappa codici persona -> rotte reali presenti in /app/landing/...  */
const LANDING_MAP: Record<string, string> = {
  ADMIN: "/landing/ADMIN",
  FAN: "/landing/FAN",
  MOD: "/landing/MOD",
  RESEARCH: "/landing/RESEARCH",
  STUD_HIGH: "/landing/STUD_HIGH",
  STUD_MIDDLE: "/landing/STUD_MIDDLE",
  STUD_PRIMARY: "/landing/STUD_PRIMARY",
};

type PersonaRow = {
  personas: { default_landing_path: string | null; code: string | null } | null;
};

/** Genera una lista ordinata di path candidati da testare */
function candidatePaths(defaultPath?: string | null, code?: string | null): string[] {
  const arr: string[] = [];
  const norm = (p: string) => (p.startsWith("/") ? p : `/${p}`);

  if (defaultPath) arr.push(norm(defaultPath));
  const c = (code || "").trim();
  if (c) {
    const up = c.toUpperCase();
    const lo = c.toLowerCase();
    if (LANDING_MAP[up]) arr.push(LANDING_MAP[up]);
    arr.push(`/landing/${up}`);
    arr.push(`/landing/${lo}`);
  }
  // fallback sicuri
  arr.push("/landing"); // index landing (se esiste)
  arr.push("/explore");
  arr.push("/");
  return Array.from(new Set(arr));
}

/** Verifica il primo path che risponde 200/OK con HEAD, altrimenti ritorna l’ultimo fallback */
async function pickFirstExisting(paths: string[]): Promise<string> {
  for (const p of paths) {
    try {
      const res = await fetch(p, { method: "HEAD", cache: "no-store" });
      if (res.ok) return p;
    } catch {
      /* ignore */
    }
  }
  return paths[paths.length - 1];
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pwdType = useMemo(() => (showPwd ? "text" : "password"), [showPwd]);

  async function redirectByPersona() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Invalid session");

    const { data: prof, error } = await supabase
      .from("profiles")
      .select("personas(default_landing_path, code)")
      .eq("id", user.id)
      .maybeSingle<PersonaRow>();

    if (error) {
      // anche senza profilo, porta ad una landing di default
      router.push(LANDING_MAP.STUD_PRIMARY);
      return;
    }

    const paths = candidatePaths(
      prof?.personas?.default_landing_path,
      prof?.personas?.code ?? undefined
    );
    const target = await pickFirstExisting(paths);
    router.push(target);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await redirectByPersona();
    } catch (e: any) {
      setErr(e?.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function signInWith(provider: "google" | "apple" | "azure") {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: typeof window !== "undefined" ? `${location.origin}/login` : undefined,
        },
      });
      if (error) throw error;
      // Il callback torna su /login: l’utente reinvia le credenziali o viene già autenticato
    } catch (e: any) {
      setErr(e?.message ?? "Social sign-in failed.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.veil} />

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.brandWrap}>
          <Image className={styles.logo} src="/logo.png" alt="GeoHistory Journey" width={220} height={220} priority />
        </div>

        {/* Tagline */}
        <div className={styles.tagline}>Where time and space turn into stories</div>
        <div className={styles.valueprop}>
          Explore journeys where history, imagination, and discovery blend.<br />
          Unlock maps, events, timelines, and let time guide you to the past
        </div>

        <h1 className={`${styles.title} ${styles.titleAligned}`}>Login</h1>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <div className={styles.label}>Email</div>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                aria-label={showPwd ? "Hide password" : "Show password"}
                className={styles.eyeBtn}
                onClick={() => setShowPwd((s) => !s)}
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

          {err && <div className={`${styles.alert} ${styles.alertError}`}>{err}</div>}

          <div className={styles.field}>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} disabled={loading} type="submit">
                {loading ? "Signing in…" : "Sign in"}
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
          <button aria-label="Google" className={styles.iconBtn} onClick={() => signInWith("google")}>
            <Image src="/icons/google.svg" alt="" width={20} height={20} />
          </button>
          <button aria-label="Apple" className={styles.iconBtn} onClick={() => signInWith("apple")}>
            <Image src="/icons/apple.svg" alt="" width={20} height={20} />
          </button>
          <button aria-label="Microsoft" className={styles.iconBtn} onClick={() => signInWith("azure")}>
            <Image src="/icons/microsoft.svg" alt="" width={20} height={20} />
          </button>
        </div>

        <p className={styles.footerEnv}>
          Project URL: {process.env.NEXT_PUBLIC_SUPABASE_URL}
        </p>
      </div>
    </div>
  );
}
