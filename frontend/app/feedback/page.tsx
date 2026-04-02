"use client";

import { Mail, MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { tUI } from "@/lib/i18n/uiLabels";
import styles from "./page.module.css";

export default function FeedbackPage() {
  const [langCode, setLangCode] = useState<string>("en");
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [form, setForm] = useState({
    type: "",
    area: "",
    title: "",
    message: "",
    wantsReply: false,
    contactEmail: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    let active = true;

    async function loadLanguage() {
      const browserLang =
        typeof window !== "undefined" ? window.navigator.language : "en";

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.warn("[Feedback] auth.getUser error:", userError.message);
        }

        if (!user) {
          if (active) {
            setLangCode(browserLang);
            setAccountEmail("");
          }
          return;
        }

        if (active) {
          setAccountEmail(typeof user.email === "string" ? user.email.trim() : "");
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("language_code")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn(
            "[Feedback] Error reading profiles.language_code:",
            error.message
          );
          if (active) setLangCode(browserLang);
          return;
        }

        if (!data || typeof data.language_code !== "string") {
          if (active) setLangCode(browserLang);
          return;
        }

        const dbLang = (data.language_code as string).trim() || browserLang;
        if (active) setLangCode(dbLang);
      } catch (err: any) {
        console.warn("[Feedback] Unexpected error loading language:", err?.message);
        if (active) setLangCode(browserLang);
      }
    }

    loadLanguage();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!accountEmail) return;
    setForm((prev) => {
      if (prev.contactEmail.trim()) return prev;
      return { ...prev, contactEmail: accountEmail };
    });
  }, [accountEmail]);

  const supportEmail = "info@geohistory.io";
  const supportMailto = `mailto:${supportEmail}?subject=${encodeURIComponent(
    tUI(langCode, "topbar.support")
  )}`;
  const typeOptions = [
    { value: "bug", label: tUI(langCode, "support.form.type.bug") },
    { value: "support", label: tUI(langCode, "support.form.type.support") },
    { value: "suggestion", label: tUI(langCode, "support.form.type.suggestion") },
    { value: "content", label: tUI(langCode, "support.form.type.content") },
    { value: "other", label: tUI(langCode, "support.form.type.other") },
  ];
  const areaOptions = [
    { value: "journey", label: tUI(langCode, "support.form.area.journey") },
    { value: "timeline", label: tUI(langCode, "support.form.area.timeline") },
    { value: "quiz", label: tUI(langCode, "support.form.area.quiz") },
    { value: "account", label: tUI(langCode, "support.form.area.account") },
    { value: "support", label: tUI(langCode, "support.form.area.support") },
    { value: "other", label: tUI(langCode, "support.form.area.other") },
  ];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMessage = form.message.trim();
    const trimmedEmail = form.contactEmail.trim();

    if (!trimmedMessage) {
      setStatus("error");
      alert(tUI(langCode, "support.form.validation.message"));
      return;
    }

    if (form.wantsReply && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus("error");
      alert(tUI(langCode, "support.form.validation.email"));
      return;
    }

    setSubmitting(true);
    setStatus("idle");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "support",
          type: form.type || "other",
          area: form.area || null,
          title: form.title.trim() || null,
          message: trimmedMessage,
          contact_email: trimmedEmail || null,
          wants_reply: form.wantsReply,
          page_path: typeof window !== "undefined" ? window.location.pathname : null,
          language_code: (langCode || "").slice(0, 2) || null,
          metadata: {},
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to submit feedback");
      }

      setForm({
        type: "",
        area: "",
        title: "",
        message: "",
        wantsReply: false,
        contactEmail: "",
      });
      setStatus("success");
    } catch (error) {
      console.warn("[Feedback] Unable to submit feedback:", error);
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={`${styles.root} relative overflow-hidden`}>
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              "radial-gradient(circle at 10% 16%, rgba(30, 126, 117, 0.18), transparent 50%), radial-gradient(circle at 88% 10%, rgba(200, 93, 54, 0.18), transparent 46%), radial-gradient(circle at 75% 82%, rgba(198, 166, 90, 0.22), transparent 55%)",
          }}
        />
        <div className={styles.grid} />
        <div className={`${styles.orb} ${styles.orbOne}`} aria-hidden="true" />
        <div className={`${styles.orb} ${styles.orbTwo}`} aria-hidden="true" />
      </div>

      <div className="relative mx-auto flex min-h-[70vh] max-w-6xl items-start px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-14 md:pt-12 md:pb-24">
        <div className="grid w-full items-start gap-6 md:gap-8 lg:grid-cols-[1fr_0.96fr]">
          <aside className="order-1 space-y-5 lg:order-2">
            <div className={`${styles.card} motion-safe:animate-[rise_0.9s_ease-out]`}>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gh-accent)]">
                    {tUI(langCode, "support.form.title")}
                  </p>
                </div>

                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="feedback-type">
                      {tUI(langCode, "support.form.type.label")}
                    </label>
                    <select
                      id="feedback-type"
                      className={styles.select}
                      value={form.type}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, type: event.target.value }))
                      }
                    >
                      <option value="">{tUI(langCode, "support.form.type.placeholder")}</option>
                      {typeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="feedback-area">
                      {tUI(langCode, "support.form.area.label")}
                    </label>
                    <select
                      id="feedback-area"
                      className={styles.select}
                      value={form.area}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, area: event.target.value }))
                      }
                    >
                      <option value="">{tUI(langCode, "support.form.area.placeholder")}</option>
                      {areaOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="feedback-title">
                      {tUI(langCode, "support.form.title.label")}
                    </label>
                    <input
                      id="feedback-title"
                      className={styles.input}
                      value={form.title}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, title: event.target.value.slice(0, 120) }))
                      }
                      placeholder={tUI(langCode, "support.form.title.placeholder")}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="feedback-message">
                      {tUI(langCode, "support.form.message.label")}
                    </label>
                    <textarea
                      id="feedback-message"
                      className={styles.textarea}
                      value={form.message}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, message: event.target.value.slice(0, 2000) }))
                      }
                      placeholder={tUI(langCode, "support.form.message.placeholder")}
                      rows={6}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="feedback-email">
                      {tUI(langCode, "support.form.email.label")}
                    </label>
                    <input
                      id="feedback-email"
                      type="email"
                      className={styles.input}
                      value={form.contactEmail}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, contactEmail: event.target.value.slice(0, 160) }))
                      }
                      placeholder={tUI(langCode, "support.form.email.placeholder")}
                    />
                  </div>

                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={form.wantsReply}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          wantsReply: event.target.checked,
                        }))
                      }
                    />
                    <span>{tUI(langCode, "support.form.reply.label")}</span>
                  </label>

                  {status === "success" ? (
                    <p className={styles.successMessage}>{tUI(langCode, "support.form.success")}</p>
                  ) : null}
                  {status === "error" ? (
                    <p className={styles.errorMessage}>{tUI(langCode, "support.form.error")}</p>
                  ) : null}

                  <div className={styles.submitRow}>
                    <button
                      type="submit"
                      disabled={submitting}
                      className={styles.submitButton}
                    >
                      {submitting ? tUI(langCode, "generic.loading") : tUI(langCode, "support.form.submit")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </aside>

          <section className="order-2 space-y-6 motion-safe:animate-[rise_0.95s_ease-out] lg:order-1">
            <p className={styles.brandTitle}>{tUI(langCode, "support.brand.title")}</p>
            <div className={`${styles.text} space-y-4 text-[15px] leading-7 sm:text-base md:text-lg`}>
              <p>{tUI(langCode, "support.disclaimer")}</p>
              <p>{tUI(langCode, "support.disclaimer_secondary")}</p>
            </div>

            <div className={`${styles.card} motion-safe:animate-[rise_1s_ease-out]`}>
              <div className="flex items-start gap-3">
                <MessageSquareText className="mt-1 h-5 w-5 text-[var(--gh-accent)]" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gh-accent)]">
                    {tUI(langCode, "support.direct.title")}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-[var(--gh-ink)]">
                    {supportEmail}
                  </p>
                  <p className="mt-2 text-sm text-[var(--gh-muted)]">
                    {tUI(langCode, "support.direct.copy")}
                  </p>
                  <a className={`${styles.primaryAction} mt-4`} href={supportMailto}>
                    <Mail className="h-5 w-5" />
                    <span>{tUI(langCode, "support.cta.email")}</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
