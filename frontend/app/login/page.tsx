// frontend/app/login/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth.module.css";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [videoMuted, setVideoMuted] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [formOpen, setFormOpen] = useState(true);

  // Cooldown locale se scatta il rate-limit
  const [cooldown, setCooldown] = useState<number>(0);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);

  // Guardia contro invii ravvicinati
  const inFlight = useRef<boolean>(false);

  const pwdType = useMemo(() => (showPwd ? "text" : "password"), [showPwd]);

  // ✅ Se esiste già una sessione → redirect immediato e certo
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session as Session | null;
      if (!mounted) return;
      if (session?.access_token) {
        try {
          router.replace("/module/landing");
          // Fallback hard se il router non naviga
          setTimeout(() => {
            if (typeof window !== "undefined") {
              window.location.href = "/module/landing";
            }
          }, 100);
        } catch {
          if (typeof window !== "undefined") {
            window.location.href = "/module/landing";
          }
        }
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gestione cooldown timer (per messaggio Too many attempts)
  useEffect(() => {
    if (cooldown <= 0) return;
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    };
  }, [cooldown]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const applyMatch = (matches: boolean) => {
      setIsMobile(matches);
      setFormOpen(matches ? false : true);
    };
    applyMatch(mq.matches);

    const handleChange = (event: MediaQueryListEvent) => applyMatch(event.matches);

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handleChange);
    } else {
      // Safari <14 fallback
      // eslint-disable-next-line deprecation/deprecation
      mq.addListener(handleChange);
    }
    return () => {
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener("change", handleChange);
      } else {
        // eslint-disable-next-line deprecation/deprecation
        mq.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const play = () => {
      el.play().catch(() => {
        /* autoplay can be blocked until user interacts */
      });
    };
    play();
  }, []);

  // 🔹 Submit con redirect immediato e fallback
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || inFlight.current || cooldown > 0) return;

    setError(null);
    setInfo(null);
    setLoading(true);
    inFlight.current = true;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("too many") || msg.includes("rate limit") || msg.includes("try again")) {
          setCooldown(120);
          setError("Too many login attempts. Please wait 2 minutes and try again.");
        } else {
          setError(error.message || "Login failed.");
        }
        return;
      }

      // ✅ redirect immediato e certo (niente listener)
      setInfo("Login successful. Redirecting...");
      try {
        router.replace("/module/landing");
        // Fallback hard nel caso l'app router non cambi vista
        setTimeout(() => {
          if (typeof window !== "undefined") {
            window.location.href = "/module/landing";
          }
        }, 100);
      } catch {
        if (typeof window !== "undefined") {
          window.location.href = "/module/landing";
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "Login failed.");
    } finally {
      // ✅ lo spinner non resta mai appeso
      setLoading(false);
      setTimeout(() => {
        inFlight.current = false;
      }, 300);
    }
  }

  const submitDisabled = loading || cooldown > 0;

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <video
        ref={videoRef}
        className={styles.video}
        autoPlay
        muted={videoMuted}
        loop
        playsInline
        aria-hidden="true"
      >
        <source src="/GHJLogin/GHJLogin.mp4" type="video/mp4" />
      </video>
      <div className={styles.veil} />

      <div
        className={`${styles.card} ${isMobile ? styles.cardMobile : ""} ${
          isMobile && !formOpen ? styles.cardCollapsed : ""
        }`}
      >
        {(!isMobile || formOpen) && (
          <div id="login-panel" className={styles.cardBody}>
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
                    disabled={submitDisabled}
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
                    disabled={submitDisabled}
                  />
                  <button
                    type="button"
                    aria-label={showPwd ? "Hide password" : "Show password"}
                    className={styles.eyeBtn}
                    onClick={() => setShowPwd((prev) => !prev)}
                    disabled={submitDisabled}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
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

              {error && (
                <div className={`${styles.alert} ${styles.alertError}`}>
                  {error}
                  {cooldown > 0 && <span style={{ marginLeft: 8 }}>({cooldown}s)</span>}
                </div>
              )}
              {info && !error && (
                <div className={`${styles.alert} ${styles.alertInfo}`}>{info}</div>
              )}

              <div className={styles.field}>
                <div className={styles.actions}>
                  <button className={styles.btnPrimary} disabled={submitDisabled} type="submit">
                    {cooldown > 0
                      ? `Please wait (${cooldown}s)`
                      : loading
                      ? "Signing in..."
                      : "Sign in"}
                  </button>

                  <div className={styles.links}>
                    <Link className={styles.a} href="/login/forgot">
                      Forgot password
                    </Link>
                    <Link className={styles.a} href="/login/register">
                      Create an account
                    </Link>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className={styles.floatControls}>
        <button
          type="button"
          className={styles.audioToggle}
          onClick={() => setVideoMuted((prev) => !prev)}
          aria-pressed={!videoMuted}
          aria-label={videoMuted ? "Attiva audio" : "Muta audio"}
        >
          {videoMuted ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M3 9v6h4l5 4V5L7 9H3Z"
                fill="currentColor"
                fillOpacity="0.9"
              />
              <path
                d="m16 9 5 5m0-5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M3 9v6h4l5 4V5L7 9H3Z"
                fill="currentColor"
                fillOpacity="0.9"
              />
              <path
                d="M16 9.5c1 .8 1.5 1.8 1.5 2.5s-.5 1.7-1.5 2.5m2.5-6.5c1.5 1.2 2.5 2.7 2.5 4s-1 2.8-2.5 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}
        </button>

        {isMobile && (
          <button
            type="button"
            className={`${styles.loginToggle} ${formOpen ? styles.loginToggleOpen : ""}`}
            aria-expanded={formOpen}
            aria-controls="login-panel"
            aria-label={formOpen ? "Chiudi login" : "Apri login"}
            onClick={() => setFormOpen((prev) => !prev)}
          >
            <span className={styles.loginToggleIcon} aria-hidden="true">
              {formOpen ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 12c1.7 0 3-1.34 3-3s-1.3-3-3-3-3 1.34-3 3 1.3 3 3 3Z" />
                  <path d="M6 20v-1a5.9 5.9 0 0 1 6-6 5.9 5.9 0 0 1 6 6v1" />
                </svg>
              )}
            </span>
            {!formOpen && <span className={styles.loginToggleText}>Login</span>}
          </button>
        )}
      </div>
    </div>
  );
}
