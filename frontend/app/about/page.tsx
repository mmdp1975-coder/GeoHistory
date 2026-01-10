// frontend/app/about/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import styles from "./page.module.css";

export default function AboutPage() {
  const [langCode, setLangCode] = useState<string>("en");
  const supabase = useMemo(() => createClientComponentClient(), []);

  // Same language selection logic used across the app.
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
          console.warn("[About] auth.getUser error:", userError.message);
        }

        if (!user) {
          if (active) setLangCode(browserLang);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("language_code")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn(
            "[About] Error reading profiles.language_code:",
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
        console.warn("[About] Unexpected error loading language:", err?.message);
        if (active) {
          const fallbackLang =
            typeof window !== "undefined" ? window.navigator.language : "en";
          setLangCode(fallbackLang);
        }
      }
    }

    loadLanguage();

    return () => {
      active = false;
    };
  }, [supabase]);

  const isItalian = (langCode || "").toLowerCase().startsWith("it");

  return (
    <main className={`${styles.root} relative overflow-hidden`}>
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, rgba(31, 122, 140, 0.18), transparent 55%), radial-gradient(circle at 85% 12%, rgba(217, 123, 74, 0.18), transparent 50%), radial-gradient(circle at 72% 85%, rgba(122, 162, 102, 0.2), transparent 55%)",
          }}
        />
        <div className={styles.grid} />
        <div className={`${styles.orb} ${styles.orbOne}`} aria-hidden="true" />
        <div className={`${styles.orb} ${styles.orbTwo}`} aria-hidden="true" />
      </div>

      <div className="relative mx-auto flex min-h-[70vh] max-w-6xl items-center px-6 py-16 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6 motion-safe:animate-[rise_0.8s_ease-out]">
            <h1 className={`${styles.title} text-4xl font-semibold leading-tight md:text-5xl`}>
              {isItalian ? "Cos'è GeoHistory" : "What is GeoHistory"}
            </h1>
            <div className={`${styles.text} space-y-4 text-base md:text-lg`}>
              <p>
                {isItalian
                  ? "GeoHistory è una piattaforma interattiva dedicata a esplorare la storia del mondo attraverso geografia e tempo. Trasforma gli eventi storici in percorsi esplorabili su mappe, timeline e narrazioni visive immersive."
                  : "GeoHistory is an interactive platform dedicated to exploring world history through geography and time. It transforms historical events into journeys that can be explored on maps, timelines, and immersive visual narratives."}
              </p>
              <p>
                {isItalian
                  ? "GeoHistory è pensato per studenti, insegnanti, appassionati di storia e chiunque sia curioso di capire come civiltà, culture ed eventi si sono evoluti nello spazio e nei secoli."
                  : "GeoHistory is designed for students, teachers, history enthusiasts, and anyone curious about how civilizations, cultures, and events evolved across space and centuries."}
              </p>
              <p>
                {isItalian ? (
                  <>
                    Combinando dati storici accurati, visualizzazione geografica e
                    storytelling, GeoHistory aiuta a capire la storia non come fatti
                    isolati, ma come storie connesse che si svolgono nel mondo. Per
                    qualsiasi informazione, contatta{" "}
                    <strong>info@geohistory.io</strong>.
                  </>
                ) : (
                  <>
                    By combining accurate historical data, geographic visualization, and
                    storytelling, GeoHistory helps users understand history not as isolated
                    facts, but as connected stories unfolding across the world. For any
                    questions, contact <strong>info@geohistory.io</strong>.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className={`${styles.card} motion-safe:animate-[rise_0.9s_ease-out]`}>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--gh-muted)]">
                {isItalian ? "Esperienza principale" : "Core experience"}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--gh-ink)]">
                {isItalian ? "La storia diventa un atlante vivente." : "History becomes a living atlas."}
              </p>
              <p className="mt-3 text-sm text-[var(--gh-muted)]">
                {isItalian
                  ? "Segui eventi tra continenti, traccia timeline e collega storie con il contesto geografico."
                  : "Follow events across continents, trace timelines, and connect stories with geographic context."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className={styles.chip}>{isItalian ? "Mappe" : "Maps"}</span>
                <span className={styles.chip}>Timeline</span>
                <span className={styles.chip}>{isItalian ? "Percorsi" : "Journeys"}</span>
                <span className={styles.chip}>{isItalian ? "Narrazioni" : "Narratives"}</span>
              </div>
            </div>

            <div className={`${styles.card} ${styles.altCard} motion-safe:animate-[rise_1s_ease-out]`}>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--gh-muted)]">
                {isItalian ? "A chi si rivolge" : "Who it is for"}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--gh-ink)]">
                {isItalian ? "Pensato per apprendere e scoprire." : "Built for learning and curiosity."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm text-[var(--gh-muted)]">
                <span className={styles.tag}>{isItalian ? "Studenti" : "Students"}</span>
                <span className={styles.tag}>{isItalian ? "Docenti" : "Teachers"}</span>
                <span className={styles.tag}>{isItalian ? "Appassionati" : "Enthusiasts"}</span>
                <span className={styles.tag}>{isItalian ? "Esploratori" : "Explorers"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

