"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  if (!url || !key) {
    throw new Error(
      "Supabase not initialized. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createClient(url, key);
}

const supabase = getSupabase();

type Persona = {
  id: string;
  code: string | null;
  name_it: string | null;
  name_en: string | null;
};

function personaLabel(persona: Persona, locale: string): string {
  const lang = locale.startsWith("it") ? "it" : "en";
  const primary = lang === "it" ? persona.name_it : persona.name_en;
  const fallback = lang === "it" ? persona.name_en : persona.name_it;
  return (primary || fallback || persona.code || "Persona").trim();
}

function passwordIssue(password: string): string | null {
  const minLength = 12;
  if (password.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (!/[A-Z]/.test(password)) return "Include at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Include at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Include at least one number.";
  if (!/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?]/.test(password)) {
    return "Include at least one special character.";
  }
  return null;
}

function passwordStrength(password: string): { label: string; color: string } {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?]/.test(password)) score += 1;

  if (score >= 5) return { label: "Strong", color: "#16a34a" };
  if (score >= 3) return { label: "Medium", color: "#f59e0b" };
  return { label: "Weak", color: "#dc2626" };
}

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [personaId, setPersonaId] = useState<string>("");
  const [accepted, setAccepted] = useState(false);

  // ✅ NEW: language selection (default = English)
  const [language, setLanguage] = useState("en");

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("personas")
          .select("id, code, name_it, name_en")
          .order("code", { ascending: true });
        if (!alive) return;
        if (error) throw error;
        const filteredPersonas = ((data || []) as Persona[]).filter((persona) => {
          const code = (persona.code || "").trim().toUpperCase();
          return code !== "ADMIN" && code !== "MOD" && code !== "MODERATOR";
        });
        setPersonas(filteredPersonas);
      } catch (err) {
        console.warn("[register] personas load failed", err);
        setPersonas([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const emailRedirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/login`;
  }, []);

  const locale =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
  const strength = passwordStrength(password);

  function validate(): string | null {
    if (!accepted) return "You must accept Terms and Privacy.";
    if (!firstName.trim() || !lastName.trim()) return "Please provide your first and last name.";
    if (personas.length > 0 && !personaId) return "Please select a persona.";
    if (!email.includes("@")) return "Please enter a valid email address.";
    const issue = passwordIssue(password);
    if (issue) return issue;
    if (password !== passwordConfirm) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const username = email.trim().toLowerCase();

      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            full_name: fullName || null,
            persona_id: personaId || null,
            username,
            // ✅ include language in user metadata
            language: language || "en",
          },
          emailRedirectTo,
        },
      });

      if (error) throw error;

      const newUserId = signUpData?.user?.id ?? null;
      if (newUserId) {
        const profilePayload = {
          id: newUserId,
          persona_id: personaId || null,
          // ✅ include language in profile table
          language: language || "en",
        };
        const response = await fetch("/api/register/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profilePayload),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          const reason = typeof detail.error === "string" ? detail.error : response.statusText;
          throw new Error(`Profile setup failed: ${reason}`);
        }
      } else {
        console.warn("[register] signUp missing user id");
      }

      setSuccess(true);
    } catch (err: any) {
      const message: string = err?.message ?? "Registration failed.";
      let friendly = message;
      if (/Signups not allowed/i.test(message)) {
        friendly = "Registrations are disabled in Supabase Auth settings.";
      } else if (/redirect/i.test(message)) {
        friendly = "Invalid redirect URL. Add it in Supabase Auth settings.";
      } else if (/rate/i.test(message)) {
        friendly = "Too many requests. Try again later.";
      }
      setError(`${friendly} (detail: ${message})`);
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
          <Image
            className={styles.logo}
            src="/logo.png"
            alt="GeoHistory Journey"
            width={220}
            height={220}
          />
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <h1 className={styles.title}>Create account</h1>
          <p className={styles.subtitle}>
            Join GeoHistory Journey. Confirm your email, then personalise the experience.
          </p>

          <div className={styles.rowTwoCols}>
            <div className={styles.field}>
              <div className={styles.label}>First name</div>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Ada"
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.label}>Last name</div>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Lovelace"
                  required
                />
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Persona</div>
            <div className={styles.inputWrap}>
              <select
                className={styles.input}
                value={personaId}
                onChange={(event) => setPersonaId(event.target.value)}
                required={personas.length > 0}
              >
                <option value="">Select persona...</option>
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {personaLabel(persona, locale)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ✅ Language selector */}
          <div className={styles.field}>
            <div className={styles.label}>Language</div>
            <div className={styles.inputWrap}>
              <select
                className={styles.input}
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en">English</option>
                <option value="it">Italiano</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>

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
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
                minLength={12}
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
            <div style={{ marginTop: 8, fontSize: 12, color: "#4b5563" }}>
              <strong style={{ color: strength.color }}>Strength: {strength.label}</strong>
              <ul style={{ marginTop: 4, paddingLeft: 16, listStyle: "disc" }}>
                <li>Use at least 12 characters.</li>
                <li>Include uppercase, lowercase, numbers, and special characters.</li>
              </ul>
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Confirm password</div>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type={showPwd2 ? "text" : "password"}
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="********"
                required
                minLength={12}
              />
              <button
                type="button"
                aria-label={showPwd2 ? "Hide password" : "Show password"}
                className={styles.eyeBtn}
                onClick={() => setShowPwd2((prev) => !prev)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPwd2 ? (
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

          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#374151" }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>
              I accept the{" "}
              <a className={styles.a} href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and the{" "}
              <a className={styles.a} href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
            </span>
          </label>

          {error && <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>}
          {success && (
            <div className={`${styles.alert} ${styles.alertOk}`}>
              Registration completed. Check your inbox and confirm your email, then log in.
            </div>
          )}

          <div className={styles.field}>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} disabled={loading} type="submit">
                {loading ? "Creating..." : "Create account"}
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
