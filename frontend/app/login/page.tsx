// frontend/app/login/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth.module.css";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const pwdType = useMemo(() => (showPwd ? "text" : "password"), [showPwd]);

  // 🔹 Logout automatico solo se già loggato (una volta sola)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session as Session | null;
      if (session?.access_token) {
        await supabase.auth.signOut(); // previene loop token/password
      }
    })();
    // nessuna dependency → solo al primo mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔹 Listener: al cambio sessione → vai alla landing (una sola volta)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        router.replace("/module/landing");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, supabase]);

  // 🔹 Gestione submit
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return; // blocca doppi click

    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes("rate limit")) {
          setError("Too many login attempts. Please wait 2 minutes and try again.");
        } else {
          setError(error.message || "Login failed.");
        }
        return;
      }
      // Redirect gestito dal listener, non qui → nessun doppio trigger
      setInfo("Login successful. Redirecting...");
    } catch (err: any) {
      setError(err?.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSocial(provider: "google" | "apple" | "azure") {
    if (loading) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
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
          <Image
            className={styles.logo}
            src="/logo.png"
            alt="GeoHistory Journey"
            width={220}
            height={220}
            priority
          />
        </div>

        <div className={styles.tagline}>Where time and space turn into stories</div>
        <div className={styles.valueprop}>
          Explore journeys where history, imagination, and discovery blend.<br />
          Unlock maps, events, timelines, and let time guide you to the past.
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
                disabled={loading}
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
          {info && !error && <div className={`${styles.alert} ${styles.alertInfo}`}>{info}</div>}

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
          <button aria-label="Google" className={styles.iconBtn} onClick={() => handleSocial("google")} disabled={loading}>
            <Image src="/icons/google.svg" alt="" width={20} height={20} />
          </button>
          <button aria-label="Apple" className={styles.iconBtn} onClick={() => handleSocial("apple")} disabled={loading}>
            <Image src="/icons/apple.svg" alt="" width={20} height={20} />
          </button>
          <button aria-label="Microsoft" className={styles.iconBtn} onClick={() => handleSocial("azure")} disabled={loading}>
            <Image src="/icons/microsoft.svg" alt="" width={20} height={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
