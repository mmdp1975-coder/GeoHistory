"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import styles from "../auth.module.css";

/* Supabase con fallback sicuro */
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
const supabase = getSupabase();

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [pwd, setPwd]             = useState("");
  const [pwd2, setPwd2]           = useState("");
  const [accepted, setAccepted]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [ok, setOk]               = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const [showPwd2, setShowPwd2]   = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);

    if (!accepted) { setErr("You must accept Terms and Privacy."); return; }
    if (pwd !== pwd2) { setErr("Passwords do not match."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password: pwd,
        options: {
          data: { first_name: firstName, last_name: lastName },
          emailRedirectTo: typeof window !== "undefined" ? `${location.origin}/login` : undefined,
        },
      });
      if (error) throw error;
      setOk(true);
    } catch (e: any) {
      setErr(e?.message ?? "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.veil} />

      <div className={styles.card}>
        <div className={styles.brandWrap}>
          <Image className={styles.logo} src="/logo.png" alt="GeoHistory Journey" width={220} height={220} />
        </div>

        <div className={styles.tagline}>Where time and space turn into stories</div>
        <div className={styles.valueprop}>
          Explore journeys where history, imagination, and discovery blend.<br />
          Unlock maps, events, timelines, and let time guide you to the past
        </div>

        {/* Titolo allineato ai campi */}
        <h1 className={`${styles.title} ${styles.titleAligned}`}>Create your account</h1>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <div className={styles.label}>First name</div>
            <div className={styles.inputWrap}>
              <input className={styles.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required />
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Last name</div>
            <div className={styles.inputWrap}>
              <input className={styles.input} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required />
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Email</div>
            <div className={styles.inputWrap}>
              <input className={styles.input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Password</div>
            <div className={styles.inputWrap}>
              <input className={styles.input} type={showPwd ? "text" : "password"} autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" required minLength={8} />
              <button type="button" aria-label={showPwd ? "Hide password" : "Show password"} className={styles.eyeBtn} onClick={() => setShowPwd(!showPwd)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPwd ? (<><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-10.94-8"/><path d="M1 1l22 22"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/></>) : (<><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></>)}
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Confirm password</div>
            <div className={styles.inputWrap}>
              <input className={styles.input} type={showPwd2 ? "text" : "password"} autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} placeholder="••••••••" required minLength={8} />
              <button type="button" aria-label={showPwd2 ? "Hide password" : "Show password"} className={styles.eyeBtn} onClick={() => setShowPwd2(!showPwd2)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPwd2 ? (<><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-10.94-8"/><path d="M1 1l22 22"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/></>) : (<><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></>)}
                </svg>
              </button>
            </div>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#374151" }}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              I accept the <a className={styles.a} href="/terms" target="_blank">Terms of Service</a> and the{" "}
              <a className={styles.a} href="/privacy" target="_blank">Privacy Policy</a>.
            </span>
          </label>

          {err && <div className={`${styles.alert} ${styles.alertError}`}>{err}</div>}
          {ok && <div className={`${styles.alert} ${styles.alertOk}`}>Registration completed. Please check your inbox to verify your email.</div>}

          <div className={styles.field}>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} disabled={loading} type="submit">
                {loading ? "Creating…" : "Create account"}
              </button>
              <div className={styles.links}>
                <Link className={styles.a} href="/login">Back to login</Link>
                <Link className={styles.a} href="/login/forgot">Forgot password</Link>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
