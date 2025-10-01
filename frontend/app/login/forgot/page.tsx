"use client";

import Link from "next/link";
import Image from "next/image";
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

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== "undefined" ? `${location.origin}/reset-password` : undefined,
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      setErr(e?.message ?? "Unable to send reset email.");
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
        <h1 className={`${styles.title} ${styles.titleAligned}`}>Reset your password</h1>

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

          {err && <div className={`${styles.alert} ${styles.alertError}`}>{err}</div>}
          {sent && <div className={`${styles.alert} ${styles.alertOk}`}>Email sent. Check your inbox.</div>}

          <div className={styles.field}>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} disabled={loading} type="submit">
                {loading ? "Sending…" : "Send reset link"}
              </button>
              <div className={styles.links}>
                <Link className={styles.a} href="/login">Back to login</Link>
                <Link className={styles.a} href="/login/register">Create an account</Link>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
