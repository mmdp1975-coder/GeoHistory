"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { tUI } from "@/lib/i18n/uiLabels";
import GlobeCanvas from "@/app/components/GlobeCanvas";

const GLOBE_H = 520;

type PointInfo = {
  lat: number;
  lon: number;
  continent?: string;
  country?: string;
  city?: string;
  radiusKm?: number;
} | null;

export default function LandingPage(): JSX.Element {
  const [pointInfo, setPointInfo] = useState<PointInfo>(null);
  const [langCode, setLangCode] = useState<string>("en");
  const supabase = useMemo(() => createClientComponentClient(), []);

  // 🔹 Lingua: come TopBar / Scorecard / GlobeCanvas (profiles.id = user.id)
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
          console.warn("[Landing] auth.getUser error:", userError.message);
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
            "[Landing] Error reading profiles.language_code:",
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
        console.warn("[Landing] Unexpected error loading language:", err?.message);
        if (active) {
          const browserLang =
            typeof window !== "undefined" ? window.navigator.language : "en";
          setLangCode(browserLang);
        }
      }
    }

    loadLanguage();

    return () => {
      active = false;
    };
  }, [supabase]);

  // 🔹 URL per esplorare la timeline a partire dal punto selezionato sul globo
  const explorePlacesHref = useMemo(() => {
    if (!pointInfo) return "/module/timeline";

    const params = new URLSearchParams({
      lat: pointInfo.lat.toFixed(6),
      lon: pointInfo.lon.toFixed(6),
      radiusKm: pointInfo?.radiusKm ? String(pointInfo.radiusKm) : "50",
    });

    if (pointInfo?.continent) params.set("continent", pointInfo.continent);
    if (pointInfo?.country) params.set("country", pointInfo.country);
    if (pointInfo?.city) params.set("city", pointInfo.city);

    return `/module/timeline?${params.toString()}`;
  }, [pointInfo]);

  const welcomeTitle = tUI(langCode, "landing.welcome.base");

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* BACKGROUND */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: 'url("/bg/login-map.jpg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "saturate(0.9) contrast(1.02)",
          opacity: 0.45,
        }}
      />

      {/* GRID 2 COLONNE */}
      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-2 md:gap-8 md:py-10">
        {/* SINISTRA: pannelli */}
        <div className="relative flex flex-col gap-4 z-40 isolate pointer-events-auto">
          {/* WELCOME */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <h2 className="text-lg font-semibold text-neutral-900">
                {welcomeTitle}
              </h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-neutral-700">
                {tUI(langCode, "landing.welcome.text")}
              </p>
            </div>
          </div>

          {/* TIMELINE */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <h2 className="text-lg font-semibold text-neutral-900">
                {tUI(langCode, "landing.timeline.title")}
              </h2>
              <Link
                href={explorePlacesHref}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                {tUI(langCode, "landing.timeline.button")}
              </Link>
            </div>

            <div className="px-5 pt-3 pb-4">
              <div className="relative w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-inner">
                <img
                  src="/img/timeline-illustration.jpg"
                  alt="Human evolution to space age on an S-shaped timeline"
                  className="w-full h-auto object-cover"
                  style={{ aspectRatio: "16/7", maxHeight: "180px" }}
                />
              </div>

              <div className="mt-2">
                <div className="h-1 w-full rounded bg-gradient-to-r from-neutral-200 via-neutral-300 to-neutral-200" />
                <div className="mt-1 flex justify-between text-[10px] text-neutral-600">
                  <span>3000 BCE</span>
                  <span>1000 BCE</span>
                  <span>0</span>
                  <span>500</span>
                  <span>1000</span>
                  <span>1500</span>
                  <span>1800</span>
                  <span>1900</span>
                  <span>2000</span>
                </div>
              </div>
            </div>
          </div>

          {/* DISCOVER */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-lg backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-900">
                {tUI(langCode, "landing.discover.title")}
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Most Rated */}
              <Link
                href="/module/rating"
                className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-yellow-500"
                      fill="currentColor"
                    >
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">
                      {tUI(
                        langCode,
                        "landing.discover.card.most_rated.title"
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">
                    {tUI(
                      langCode,
                      "landing.discover.card.most_rated.text"
                    )}
                  </p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">
                  {tUI(langCode, "scorecard.cta.open")}
                </span>
              </Link>

              {/* Favourites */}
              <Link
                href="/module/favourites"
                className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-rose-500"
                      fill="currentColor"
                    >
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">
                      {tUI(
                        langCode,
                        "landing.discover.card.favourites.title"
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">
                    {tUI(
                      langCode,
                      "landing.discover.card.favourites.text"
                    )}
                  </p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">
                  {tUI(langCode, "scorecard.cta.open")}
                </span>
              </Link>

              {/* New Journeys */}
              <Link
                href="/module/NewJourney"
                className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-sky-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    >
                      <path d="M5 5h10l4 4v10H5z" />
                      <path d="M9 9h6" />
                      <path d="M9 13h6" />
                      <path d="M9 17h3" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">
                      {tUI(
                        langCode,
                        "landing.discover.card.new_journeys.title"
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">
                    {tUI(
                      langCode,
                      "landing.discover.card.new_journeys.text"
                    )}
                  </p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">
                  {tUI(langCode, "scorecard.cta.open")}
                </span>
              </Link>

              {/* Build Journey */}
              <Link
                href="/module/build-journey"
                className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-emerald-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    >
                      <path d="M12 5v14" strokeLinecap="round" />
                      <path d="M5 12h14" strokeLinecap="round" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">
                      {tUI(
                        langCode,
                        "landing.discover.card.build_journey.title"
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">
                    {tUI(
                      langCode,
                      "landing.discover.card.build_journey.text"
                    )}
                  </p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">
                  {tUI(langCode, "scorecard.cta.open")}
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* DESTRA: globo */}
        <div className="relative z-10 rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md overflow-hidden isolate">
          <div className="relative z-20 flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
            <h1 className="text-lg font-semibold text-neutral-900">
              {tUI(langCode, "landing.globe.title")}
            </h1>
            <Link
              href={explorePlacesHref}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              {tUI(langCode, "landing.globe.button")}
            </Link>
          </div>

          <div className="px-5 pb-5 pt-3 relative">
            <div className="p-3 relative z-0">
              <div style={{ width: "100%" }}>
                <GlobeCanvas
                  height={GLOBE_H}
                  radius={1.4}
                  onPointSelect={(info: any) => setPointInfo(info)}
                  initialRadiusKm={pointInfo?.radiusKm ?? 50}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
