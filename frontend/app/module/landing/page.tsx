// PATH: frontend/app/module/landing/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const GLOBE_H = 520;

const GlobeCanvas: any = dynamic(
  async () => {
    const m = await import('@/app/components/GlobeCanvas');
    return (m as any).default ?? (m as any).GlobeCanvas;
  },
  { ssr: false }
);

type PointInfo = {
  lat: number;
  lon: number;
  continent?: string;
  country?: string;
  city?: string;
  radiusKm?: number;
} | null;

function resolveUserNameFromPage(): string {
  try {
    const w = typeof window !== 'undefined' ? (window as any) : undefined;
    if (w) {
      const gh1 = w.__GH_CURRENT_USER__;
      if (gh1) {
        const n =
          gh1.full_name ??
          gh1.profile?.full_name ??
          gh1.user?.user_metadata?.full_name ??
          gh1.user?.raw_user_meta_data?.full_name ??
          null;
        if (n && String(n).trim()) return String(n).trim();
      }
    }
    const tryKeys = ['gh_full_name', 'full_name', 'profile_full_name', 'name'];
    for (const k of tryKeys) {
      const v = localStorage.getItem(k);
      if (v && v.trim()) return v.trim();
    }
  } catch {}
  return 'Explorer';
}

export default function LandingPage(): JSX.Element {
  const [pointInfo, setPointInfo] = useState<PointInfo>(null);
  const [userName, setUserName] = useState<string>('Explorer');

  useEffect(() => {
    setUserName(resolveUserNameFromPage());
  }, []);

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

      {/* GRID 2 COLONNE */}
      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-2 md:gap-8 md:py-10">
        {/* SINISTRA: pannelli — z-30 e isolate, sempre cliccabili */}
        <div className="flex flex-col gap-4 z-30 isolate pointer-events-auto">
          {/* WELCOME */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <h2 className="text-lg font-semibold text-neutral-900">
                Welcome to GeoHistory{userName ? `, ${userName}!` : '!'}
              </h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-neutral-700">
                Travel through centuries and continents to uncover how human events shaped our world.
                Choose your path: explore by <strong>Age</strong>, <strong>Place</strong>, or <strong>Theme</strong>.
              </p>
            </div>
          </div>

          {/* TIMELINE */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <h2 className="text-lg font-semibold text-neutral-900">Timeline Explorer</h2>
              <button
                onClick={() => window.location.assign(explorePlacesHref)}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Explore Ages
              </button>
            </div>

            <div className="px-5 pt-3 pb-4">
              <div className="relative w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-inner">
                <img
                  src="/img/timeline-illustration.jpg"
                  alt="Human evolution to space age on an S-shaped timeline"
                  className="w-full h-auto object-cover"
                  style={{ aspectRatio: '16/7', maxHeight: '180px' }}
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

          {/* DISCOVER (Most Rated, Favourites, New Journeys) */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-lg backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-900">Discover</h3>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Link href="/module/rating" className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-yellow-500" fill="currentColor">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">Most Rated</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">Top-rated journeys and events.</p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">Open</span>
              </Link>

              <Link href="/module/favourites" className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">Favourites</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">Your saved journeys.</p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">Open</span>
              </Link>

              <Link href="/module/NewJourney" className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white/90 p-4 shadow hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-600" fill="currentColor">
                      <path d="M11 11V6a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5z" />
                    </svg>
                    <span className="text-sm font-semibold text-neutral-900">New Journeys</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">Latest journeys published by users.</p>
                </div>
                <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">Open</span>
              </Link>
            </div>
          </div>
        </div>

        {/* DESTRA: globo — z-10, confinato nel suo contenitore */}
        <div className="relative z-10 rounded-2xl border border-neutral-200 bg-white/90 shadow-lg backdrop-blur-md overflow-hidden isolate">
          <div className="relative z-20 flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
            <h1 className="text-lg font-semibold text-neutral-900">Globe Explorer</h1>
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.location.assign(explorePlacesHref);
              }}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              Explore Places
            </button>
          </div>

          <div className="px-5 pb-5 pt-3 relative">
            <div className="p-3 relative z-10">
              <div style={{ width: '100%', height: GLOBE_H }}>
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
