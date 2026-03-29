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
  const [mobilePanel, setMobilePanel] = useState<"timeline" | "globe">(
    "timeline"
  );

  const clearGeoSelection = () => {
    setPointInfo(null);
    setGlobeResetKey((value) => value + 1);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLangCode(window.navigator.language || "it");
    }
  }, []);

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
    <main className="relative min-h-screen w-full overflow-hidden pb-8 lg:h-[calc(100vh-74px)] lg:min-h-0 lg:pb-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: 'url("/bg/login-map.jpg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "grayscale(0.18) saturate(0.45) contrast(0.9)",
          opacity: 0.16,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 12% 12%, rgba(199,147,67,0.14), transparent 22%), radial-gradient(circle at 84% 10%, rgba(78,123,255,0.16), transparent 18%), linear-gradient(180deg, rgba(9,11,18,0.92) 0%, rgba(11,16,32,0.96) 48%, rgba(9,11,18,0.99) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
        style={{
          background:
            "radial-gradient(circle at 12% 12%, rgba(199,147,67,0.18), transparent 24%), radial-gradient(circle at 84% 10%, rgba(28,77,117,0.2), transparent 18%), linear-gradient(180deg, rgba(247,244,237,0.7) 0%, rgba(243,239,230,0.92) 48%, rgba(238,233,224,0.98) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-0 py-0 lg:h-full lg:px-6 lg:py-3">
        <div className="flex flex-col gap-3 lg:hidden">
          <section
            className={
              mobilePanel === "timeline"
                ? "overflow-hidden"
                : "min-h-0 overflow-hidden"
            }
          >
            {mobilePanel === "timeline" ? (
              <Suspense
                fallback={
                  <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-white/55">
                    Loading timeline...
                  </div>
                }
              >
                <TimelinePage
                  embedded
                  initialSortMode="published"
                  externalGeoFilter={selectedGeoFilter}
                  onClearExternalGeoFilter={clearGeoSelection}
                  onOpenEmbeddedMap={() => setMobilePanel("globe")}
                />
              </Suspense>
            ) : (
              <div className="relative h-[calc(100dvh-var(--gh-topbar-height,52px)-12px)] min-h-[560px]">
                <button
                  type="button"
                  onClick={() => setMobilePanel("timeline")}
                  className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-[0_14px_32px_-24px_rgba(0,0,0,0.6)] backdrop-blur-md"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M5 7h14M5 12h14M5 17h9" strokeLinecap="round" />
                  </svg>
                  <span>Timeline</span>
                </button>
                <GlobeCanvas
                  embedded
                  height={460}
                  radius={1.18}
                  onPointSelect={(info: any) => setPointInfo(info)}
                  initialRadiusKm={pointInfo?.radiusKm ?? DEFAULT_GEO_RADIUS_KM}
                  clearSelectionSignal={globeResetKey}
                  footerPosition="top"
                />
              </div>
            )}
          </section>

        </div>

        <div className="hidden grid-cols-1 gap-6 lg:grid lg:h-full lg:grid-cols-[minmax(0,1.08fr)_minmax(520px,0.92fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-6">
        <section className="min-w-0 overflow-hidden rounded-[34px] border border-[rgba(18,49,78,0.08)] bg-[rgba(255,252,246,0.68)] shadow-[0_28px_90px_-52px_rgba(16,32,51,0.55)] backdrop-blur-xl lg:h-full">
          <Suspense
            fallback={
              <div className="flex h-full min-h-[660px] items-center justify-center text-sm text-neutral-500">
                Loading timeline...
              </div>
            }
          >
            <TimelinePage
              embedded
              initialSortMode="published"
              externalGeoFilter={selectedGeoFilter}
              onClearExternalGeoFilter={clearGeoSelection}
            />
          </Suspense>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[34px] border border-[rgba(18,49,78,0.08)] bg-[rgba(255,252,246,0.68)] shadow-[0_28px_90px_-52px_rgba(16,32,51,0.55)] backdrop-blur-xl lg:h-full">
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

        </div>
      </div>
    </main>
  );
}
