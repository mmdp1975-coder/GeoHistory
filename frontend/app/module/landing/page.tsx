"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import GlobeCanvas from "@/app/components/GlobeCanvas";
import TimelinePage from "@/app/module/timeline/page_inner";
import { tUI } from "@/lib/i18n/uiLabels";

const GLOBE_H = 660;
const DEFAULT_GEO_RADIUS_KM = 1500;
const MIN_EFFECTIVE_GEO_RADIUS_KM = 150;

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
  const [globeResetKey, setGlobeResetKey] = useState(0);
  const [langCode, setLangCode] = useState("it");

  const clearGeoSelection = () => {
    setPointInfo(null);
    setGlobeResetKey((value) => value + 1);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLangCode(window.navigator.language || "it");
    }
  }, []);

  const discoverCards = [
    {
      href: "/module/rating",
      title: tUI(langCode, "landing.discover.card.most_rated.title"),
      text: tUI(langCode, "landing.discover.card.most_rated.text"),
      iconWrap: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-amber-600"
          fill="currentColor"
        >
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ),
    },
    {
      href: "/module/favourites",
      title: tUI(langCode, "landing.discover.card.favourites.title"),
      text: tUI(langCode, "landing.discover.card.favourites.text"),
      iconWrap: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-rose-600"
          fill="currentColor"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
    },
    {
      href: "/module/NewJourney",
      title: tUI(langCode, "landing.discover.card.new_journeys.title"),
      text: tUI(langCode, "landing.discover.card.new_journeys.text"),
      iconWrap: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
      icon: (
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
      ),
    },
    {
      href: "/module/build-journey",
      title: tUI(langCode, "landing.discover.card.build_journey.title"),
      text: tUI(langCode, "landing.discover.card.build_journey.text"),
      iconWrap: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
      icon: (
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
      ),
    },
  ];
  const selectedGeoFilter = pointInfo
    ? {
        lat: pointInfo.lat,
        lon: pointInfo.lon,
        radiusKm: Math.max(
          MIN_EFFECTIVE_GEO_RADIUS_KM,
          pointInfo.radiusKm ?? DEFAULT_GEO_RADIUS_KM
        ),
      }
    : null;

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
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

      <div className="relative z-10 mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(520px,0.88fr)] lg:grid-rows-[calc(100vh-11.5rem)_auto] lg:items-start lg:gap-6 lg:px-6 lg:py-3">
        <section className="min-w-0 overflow-hidden rounded-[28px] border border-neutral-200/90 bg-white/90 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-md lg:h-full">
          <Suspense
            fallback={
              <div className="flex h-full min-h-[660px] items-center justify-center text-sm text-neutral-500">
                Loading timeline...
              </div>
            }
          >
            <TimelinePage
              embedded
              externalGeoFilter={selectedGeoFilter}
              onClearExternalGeoFilter={clearGeoSelection}
            />
          </Suspense>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[28px] border border-neutral-200/90 bg-white/90 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-md lg:h-full">
          <div className="relative flex min-h-[660px] items-start justify-center lg:h-full lg:min-h-0">
            <div className="h-full w-full">
              <GlobeCanvas
                embedded
                height={GLOBE_H}
                radius={1.18}
                onPointSelect={(info: any) => setPointInfo(info)}
                initialRadiusKm={pointInfo?.radiusKm ?? DEFAULT_GEO_RADIUS_KM}
                clearSelectionSignal={globeResetKey}
              />
            </div>
          </div>
        </section>

        <section className="min-w-0 pt-4 lg:col-span-2 lg:-mt-10 lg:pt-8">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {discoverCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group relative overflow-hidden rounded-2xl border border-neutral-300 bg-gradient-to-b from-white to-neutral-100 px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.96)_inset,0_12px_26px_-18px_rgba(15,23,42,0.45),0_3px_0_rgba(212,212,216,0.95)] transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-400 hover:from-white hover:to-neutral-50 hover:shadow-[0_1px_0_rgba(255,255,255,0.98)_inset,0_18px_34px_-20px_rgba(15,23,42,0.4),0_4px_0_rgba(212,212,216,0.95)] active:translate-y-[2px] active:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_7px_12px_-12px_rgba(15,23,42,0.28),0_1px_0_rgba(212,212,216,0.9)]"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-3 top-0 h-px rounded-full bg-white/90"
                />
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconWrap}`}
                  >
                    {card.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-neutral-900">
                      {card.title}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-neutral-600">
                      {card.text}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
