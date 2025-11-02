'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Import dinamico del globo 3D
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
      radiusKm: pointInfo.radiusKm ? String(pointInfo.radiusKm) : '50',
    });
    if (pointInfo.continent) params.set('continent', pointInfo.continent);
    if (pointInfo.country) params.set('country', pointInfo.country);
    if (pointInfo.city) params.set('city', pointInfo.city);
    return `/module/timeline?${params.toString()}`;
  }, [pointInfo]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* ==== SFONDO STORICO (NON TOCCARE) ==== */}
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

      {/* ==== CONTENUTO ==== */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:py-10">
        {/* ====================== COLONNA SINISTRA: Globe Explorer ====================== */}
        <section aria-label="Globe Explorer" className="w-full md:w-1/2">
          <div className="rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md">
            {/* HEADER */}
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <h1 className="text-lg font-semibold text-neutral-900">Globe Explorer</h1>

              <Link
                href={explorePlacesHref}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 ${
                  pointInfo ? 'bg-neutral-900' : 'bg-neutral-700'
                }`}
                title={pointInfo ? 'Explore places near the selected location' : 'Explore all places'}
              >
                Explore Places
              </Link>
            </div>

            {/* BODY */}
            <div className="px-5 pb-5 pt-3">
              {/* GLOBO 3D */}
              <div className="relative mt-2 overflow-hidden rounded-xl border border-neutral-200">
                <GlobeCanvas
                  height={300}
                  radius={1.8}
                  onPointSelect={(info: any) => setPointInfo(info)}
                  initialRadiusKm={pointInfo?.radiusKm ?? 50}
                />
              </div>

              {/* INFO PUNTO (badge già gestito nel componente) */}
            </div>
          </div>
        </section>

        {/* ====================== COLONNA DESTRA ====================== */}
        <section aria-label="Right column" className="w-full space-y-6 md:w-1/2">
          {/* ---- Timeline Explorer ---- */}
          <div className="rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <h2 className="text-lg font-semibold text-neutral-900">Timeline Explorer</h2>
              <Link
                href="/module/timeline"
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Explore History
              </Link>
            </div>

            <div className="px-5 pb-5 pt-3">
              {/* ANTEPRIMA TIMELINE MODERNA (come richiesto) */}
              <div className="relative mb-1 h-36 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-inner">
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-[0.12]"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(0,0,0,.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.6) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />

                <div className="absolute top-2 left-4 right-4 flex justify-between text-[11px] font-medium text-neutral-700">
                  <span>Ancient</span>
                  <span>Middle Ages</span>
                  <span>Renaissance</span>
                  <span>Industrial</span>
                  <span>Modern</span>
                  <span>Contemporary</span>
                </div>

                <div className="absolute left-6 right-6 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-neutral-200" />
                {[0, 20, 40, 60, 80, 100].map((p) => (
                  <div
                    key={p}
                    className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-neutral-300"
                    style={{ left: `calc(6% + ${p} * 0.88%)` }}
                  />
                ))}

                <div className="absolute inset-x-6 top-1/2 -translate-y-1/2">
                  <div className="relative h-0">
                    <div className="timeline-dot" />
                    <div className="timeline-trail" />
                  </div>
                </div>

                <div className="absolute bottom-2 left-4 right-4 flex items-center justify-between text-[11px] text-neutral-500">
                  <span>-3000</span>
                  <span>-500</span>
                  <span>1300</span>
                  <span>1800</span>
                  <span>1950</span>
                  <span>2025</span>
                </div>

                <style jsx>{`
                  @keyframes glide {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(calc(100% - 8px)); }
                  }
                  .timeline-dot {
                    position: absolute;
                    top: -6px;
                    left: 0;
                    height: 14px;
                    width: 14px;
                    border-radius: 9999px;
                    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 16px 6px rgba(59, 130, 246, 0.25),
                                0 0 32px 12px rgba(14, 165, 233, 0.2);
                    background: radial-gradient(circle at 30% 30%, #93c5fd 0%, #2563eb 35%, #0ea5e9 100%);
                    animation: glide 6.5s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
                  }
                  .timeline-trail {
                    position: absolute;
                    top: -1.5px;
                    left: 0;
                    height: 6px;
                    width: 100%;
                    pointer-events: none;
                    background: linear-gradient(90deg, rgba(59, 130, 246, 0.0), rgba(59, 130, 246, 0.22));
                    mask-image: linear-gradient(90deg, black 0%, transparent 60%);
                    -webkit-mask-image: linear-gradient(90deg, black 0%, transparent 60%);
                    animation: glide 6.5s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
                  }
                  .timeline-dot:hover, .timeline-trail:hover {
                    animation-play-state: paused;
                  }
                `}</style>
              </div>
            </div>
          </div>

          {/* ---- PANNELLO SEPARATO: Widgets (Most Rated + Favourites) ---- */}
          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-lg backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-900">Discover</h3>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Most Rated */}
              <Link
                href="/module/rating"
                className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow transition-shadow hover:shadow-md"
              >
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
              <Link
                href="/module/favourites"
                className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="currentColor" aria-hidden>
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">Favourites</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">Quick access to your saved items.</p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-800">
                  Open
                </span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
