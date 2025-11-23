// frontend/app/login/reset_password/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../auth.module.css";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import * as ClientModule from "../../../lib/supabaseBrowserClient";

function getSupabase(): SupabaseClient {
  const modAny = ClientModule as any;
  const named = modAny?.supabase as SupabaseClient | undefined;
  const deflt = (modAny?.default ?? null) as SupabaseClient | null;
  if (named) return named;
  if (deflt) return deflt;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new Error("Supabase not initialized");
  return createClient(url, key);
}

function getHashTokens() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    supabaseRef.current = getSupabase();
    setSupabaseReady(true);
  }, []);

  useEffect(() => {
    if (!supabaseReady || !supabaseRef.current) return;
    const supabase = supabaseRef.current;
    let cancelled = false;
    async function hydrateSession() {
      setErr(null);
      setChecking(true);
      setNeedsEmail(false);

      const emailFromLink = searchParams?.get("email") || undefined;
      if (emailFromLink) setEmailInput(emailFromLink);

      // 1) Nuovo flusso PKCE (query ?code=)
      const code = searchParams?.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!cancelled) {
          if (error) {
            // Fallback per link aperto su device diverso (code verifier mancante)
            if (emailFromLink) {
              const { error: otpError } = await supabase.auth.verifyOtp({
                email: emailFromLink,
                token_hash: code,
                type: "recovery",
              });
              if (otpError) {
                setErr(otpError.message || error.message || "Invalid or expired link.");
              } else {
                setReady(true);
              }
            } else {
              // Se manca l'email, chiediamola per completare verifyOtp
              setNeedsEmail(true);
              setErr("Enter your email to finish resetting your password.");
            }
          } else {
            setReady(true);
          }
          setChecking(false);
        }
        return;
      }

      // 2) Fallback per link legacy con #access_token
      const hashTokens = getHashTokens();
      if (hashTokens) {
        const { error } = await supabase.auth.setSession(hashTokens);
        if (!cancelled) {
          if (error) setErr(error.message || "Invalid or expired link.");
          else setReady(true);
          setChecking(false);
        }
        return;
      }

      if (!cancelled) {
        setErr("Reset link not valid. Request a new one.");
        setChecking(false);
      }
    }
    hydrateSession();
    return () => {
      cancelled = true;
    };
  }, [searchParams, supabaseReady]);

  async function handleVerifyWithEmail() {
    const code = searchParams?.get("code");
    if (!code || !emailInput || loading || checking || !supabaseRef.current) return;
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabaseRef.current.auth.verifyOtp({
        email: emailInput,
        token_hash: code,
        type: "recovery",
      });
      if (error) throw error;
      setReady(true);
      setNeedsEmail(false);
    } catch (e: any) {
      setErr(e?.message ?? "Unable to verify reset link. Check your email and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || checking || loading || inFlight.current || !supabaseRef.current) return;
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setErr(null);
    setLoading(true);
    inFlight.current = true;
    try {
      const { error } = await supabaseRef.current.auth.updateUser({ password });
      if (error) throw error;
      setOk(true);
    } catch (e: any) {
      setErr(e?.message ?? "Unable to update password.");
    } finally {
      setLoading(false);
      setTimeout(() => {
        inFlight.current = false;
      }, 300);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.veil} />
      <div className={styles.card}>
        <h1 className={`${styles.title} ${styles.titleAligned}`}>Choose a new password</h1>

        {checking && <div className={styles.alert}>Verifying your reset link...</div>}
        {!checking && err && <div className={`${styles.alert} ${styles.alertError}`}>{err}</div>}
        {ok && (
          <div className={`${styles.alert} ${styles.alertOk}`}>
            Password updated. You can now sign in.
          </div>
        )}

        {!ok && needsEmail && (
          <div className={styles.form} style={{ marginBottom: 8 }}>
            <div className={styles.field}>
              <div className={styles.label}>Email</div>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@email.com"
                  required
                />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.actions}>
                <button className={styles.btnPrimary} type="button" onClick={handleVerifyWithEmail} disabled={!emailInput || loading || !supabaseReady}>
                  {loading ? "Verifying..." : "Verify and continue"}
                </button>
                <div className={styles.links}>
                  <Link className={styles.a} href="/login/forgot">Request a new link</Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {!ok && (
          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.field}>
              <div className={styles.label}>New password</div>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={!ready || checking || needsEmail}
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.label}>Confirm password</div>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  disabled={!ready || checking || needsEmail}
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.actions}>
                <button className={styles.btnPrimary} type="submit" disabled={!ready || checking || loading || needsEmail || !supabaseReady}>
                  {loading ? "Saving..." : "Update password"}
                </button>
                <div className={styles.links}>
                  <Link className={styles.a} href="/login">
                    Back to login
                  </Link>
                  <Link className={styles.a} href="/login/forgot">
                    Request a new link
                  </Link>
                </div>
              </div>
            </div>
          </form>
        )}

        {ok && (
          <div className={styles.links} style={{ marginTop: 12 }}>
            <Link className={styles.a} href="/login">
              Go to login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
