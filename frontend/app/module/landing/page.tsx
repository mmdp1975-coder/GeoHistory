'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Lasciare il Globe invariato
const GlobeCanvas: any = dynamic(() => import('@/app/components/GlobeCanvas'), { ssr: false });

type PointInfo = {
  lat: number;
  lon: number;
  continent?: string;
  country?: string;
  city?: string;
  radiusKm?: number;
} | null;

export default function LandingPage() {
  const [pointInfo, setPointInfo] = useState<PointInfo>(null);

  const explorePlacesHref = useMemo(() => {
    if (!pointInfo) return '/module/timeline';
    const params = new URLSearchParams({
      lat: pointInfo.lat.toFixed(6),
      lon: pointInfo.lon.toFixed(6),
      radiusKm: pointInfo?.radiusKm ? String(pointInfo.radiusKm) : '50',
    });
    if (pointInfo?.continent) params.set('continent', pointInfo.continent);
    if (pointInfo?.country) params.set('country', pointInfo.country);
    if (pointInfo?.city) params.set('city', pointInfo.city);
    return `/module/timeline?${params.toString()}`;
  }, [pointInfo]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* BACKGROUND */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: 'url("/bg/login-map.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: 'saturate(0.9) contrast(1.02)',
          opacity: 0.45,
        }}
      />

      {/* LAYOUT */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:py-10">
        {/* COLONNA SINISTRA: Globe */}
        <section aria-label="Globe Explorer" className="w-full md:w-1/2">
          <div className="rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md">
            <div className="relative z-20 flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <h1 className="text-lg font-semibold text-neutral-900">Globe Explorer</h1>
              <button
                onClick={(e) => { e.stopPropagation(); window.location.assign(explorePlacesHref); }}
                className="pointer-events-auto rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Explore Places
              </button>
            </div>
            <div className="px-5 pb-5 pt-3">
              <div className="p-3 relative z-0">
                <GlobeCanvas
                  height={300}
                  radius={1.8}
                  onPointSelect={(info: any) => setPointInfo(info)}
                  initialRadiusKm={pointInfo?.radiusKm ?? 50}
                />
              </div>
            </div>
          </div>
        </section>

        {/* COLONNA DESTRA: Timeline + Discover */}
        <section aria-label="Right column" className="w-full md:w-1/2 flex flex-col justify-between gap-6">
          {/* TIMELINE */}
          <div className="flex-1 rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <h2 className="text-lg font-semibold text-neutral-900">Timeline Explorer</h2>
              <button
                onClick={() => window.location.assign(explorePlacesHref)}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Explore Places
              </button>
            </div>

            <div className="px-5 pb-5 pt-3">
              <div className="relative mb-1 h-36 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-inner">
                {/* Griglia di sfondo */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-[0.12]"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(0,0,0,.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.6) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />

                {/* Etichette superiori */}
                <div className="absolute top-2 left-4 right-4 flex justify-between text-[11px] font-medium text-neutral-700">
                  <span>Ancient</span>
                  <span>Middle Ages</span>
                  <span>Renaissance</span>
                  <span>Industrial</span>
                  <span>Modern</span>
                  <span>Contemporary</span>
                </div>

                {/* Asse */}
                <div className="absolute left-6 right-6 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-neutral-200" />

                {/* Ticks */}
                {[0, 20, 40, 60, 80, 100].map((p) => (
                  <div
                    key={p}
                    className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-neutral-300"
                    style={{ left: `calc(6% + ${p} * 0.88%)` }}
                  />
                ))}

                {/* Cursore blu animato */}
                <div className="absolute inset-x-6 top-1/2 -translate-y-1/2">
                  <div className="relative h-0">
                    <span className="gh-dot" />
                    <span className="gh-trail" />
                  </div>
                </div>

                {/* Etichette inferiori */}
                <div className="absolute bottom-2 left-4 right-4 flex items-center justify-between text-[11px] text-neutral-500">
                  <span>-3000</span>
                  <span>-500</span>
                  <span>1300</span>
                  <span>1800</span>
                  <span>1950</span>
                  <span>2025</span>
                </div>

                <style jsx>{`
                  @keyframes gh_move {
                    0% { left: 0; }
                    100% { left: calc(100% - 14px); }
                  }
                  @keyframes gh_trail {
                    0% { width: 0; }
                    100% { width: 100%; }
                  }
                  .gh-dot {
                    position: absolute;
                    top: -6px;
                    left: 0;
                    width: 14px;
                    height: 14px;
                    border-radius: 9999px;
                    background: radial-gradient(circle at 30% 30%, #93c5fd 0%, #2563eb 35%, #0ea5e9 100%);
                    box-shadow:
                      0 0 0 2px rgba(255,255,255,0.9),
                      0 6px 18px rgba(59,130,246,0.35),
                      0 0 28px rgba(14,165,233,0.25);
                    animation: gh_move 6.5s cubic-bezier(0.22,1,0.36,1) infinite alternate;
                  }
                  .gh-trail {
                    position: absolute;
                    top: -1.5px;
                    left: 0;
                    height: 6px;
                    width: 0;
                    background: linear-gradient(90deg, rgba(59,130,246,0.00), rgba(59,130,246,0.22));
                    mask-image: linear-gradient(90deg, black 0%, transparent 60%);
                    -webkit-mask-image: linear-gradient(90deg, black 0%, transparent 60%);
                    animation: gh_trail 6.5s cubic-bezier(0.22,1,0.36,1) infinite alternate;
                  }
                `}</style>
              </div>
            </div>
          </div>

          {/* DISCOVER */}
          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-lg backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-900">Discover</h3>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Most Rated */}
              <Link href="/module/rating" className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-yellow-500" fill="currentColor" aria-hidden>
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">Most Rated</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">Top-rated journeys and events.</p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-800">
                  Open
                </span>
              </Link>

              {/* Favourites */}
              <Link href="/module/favourites" className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="currentColor" aria-hidden>
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">Favourites</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">Your saved journeys.</p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-800">
                  Open
                </span>
              </Link>

              {/* New Journeys */}
              <Link href="/module/NewJourney" className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-600" fill="currentColor" aria-hidden>
                      <path d="M11 11V6a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">New Journeys</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">Latest journeys published by users.</p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-800">
                  Open
                </span>
              </Link>

              <div className="hidden sm:block" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
