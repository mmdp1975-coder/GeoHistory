// frontend/app/login/reset_password/page.tsx
"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../auth.module.css";

import type { SupabaseClient, EmailOtpType } from "@supabase/supabase-js";
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
  if (!url || !key) {
    throw new Error("Supabase not initialized");
  }

  return createClient(url, key);
}

export const dynamic = "force-dynamic";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = getSupabase();
  }

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  // STEP 1: verify the token_hash and create a session
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const token_hash = searchParams.get("token_hash");
        const typeParam = searchParams.get("type") as EmailOtpType | null;

        if (!token_hash || !typeParam) {
          if (!cancelled) {
            setErr(
              "This password reset link is invalid or has expired. Please request a new one."
            );
            setChecking(false);
          }
          return;
        }

        const supabase = supabaseRef.current!;
        const { error } = await supabase.auth.verifyOtp({
          type: typeParam,
          token_hash,
        });

        if (cancelled) return;

        if (error) {
          setErr(
            error.message ||
              "This password reset link is invalid or has expired. Please request a new one."
          );
          setChecking(false);
          return;
        }

        // Session is now active, enable form
        setReady(true);
        setChecking(false);
      } catch (e: any) {
        if (!cancelled) {
          setErr(
            e?.message ?? "Unable to verify reset link. Please request a new one."
          );
          setChecking(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checking || !ready || loading || inFlight.current || !supabaseRef.current) {
      return;
    }

    if (!password || !confirm) {
      setErr("Please enter and confirm your new password.");
      return;
    }
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
      const supabase = supabaseRef.current!;
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setErr(error.message || "Unable to update password.");
        return;
      }

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

  const disabled = !ready || checking || loading || ok;

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.veil} />
      <div className={styles.card}>
        <h1 className={`${styles.title} ${styles.titleAligned}`}>
          Choose a new password (v3)
        </h1>

        {checking && !err && (
          <div className={styles.alert}>Verifying your reset link...</div>
        )}

        {!checking && err && (
          <div className={`${styles.alert} ${styles.alertError}`}>{err}</div>
        )}

        {!ok && (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <div className={styles.label}>New password</div>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={disabled}
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.label}>Confirm password</div>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={disabled}
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.actions}>
                <button
                  className={styles.btnPrimary}
                  type="submit"
                  disabled={disabled}
                >
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
          <div className={`${styles.alert} ${styles.alertOk}`}>
            Password updated. You can now sign in.
            <div className={styles.links} style={{ marginTop: 8 }}>
              <Link className={styles.a} href="/login">
                Go to login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.bg} />
          <div className={styles.veil} />
          <div className={styles.card}>
            <div className={styles.alert}>Loading...</div>
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
