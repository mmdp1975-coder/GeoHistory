// frontend/app/components/TopBar.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Home, ArrowLeft, Settings as SettingsIcon, LogOut, PlayCircle, X, Volume2 } from 'lucide-react';

export default function TopBar() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [volume, setVolume] = useState(100);
  const [shouldAutoplay, setShouldAutoplay] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.push('/login');
    }
  }

  function goHome() {
    router.push('/module/landing'); // ora punta sempre alla landing principale
  }

  function openVideo() {
    setIsVideoOpen(true);
    setShouldAutoplay(true);
    setPlaybackError(false);
  }

  function closeVideo() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setIsVideoOpen(false);
  }

  useEffect(() => {
    if (!isVideoOpen || !videoRef.current) {
      return;
    }

    const normalizedVolume = volume / 100;
    videoRef.current.volume = normalizedVolume;
    videoRef.current.muted = normalizedVolume === 0;
  }, [volume, isVideoOpen]);

  useEffect(() => {
    if (!isVideoOpen || !shouldAutoplay || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    const normalizedVolume = volume / 100;

    video.currentTime = 0;
    video.volume = normalizedVolume;
    video.muted = normalizedVolume === 0;

    const playPromise = video.play();

    if (playPromise) {
      playPromise
        .then(() => setPlaybackError(false))
        .catch(() => setPlaybackError(true));
    } else {
      setPlaybackError(false);
    }

    setShouldAutoplay(false);
  }, [isVideoOpen, shouldAutoplay, volume]);

  return (
    <>
      <nav className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
          {/* Logo + Motto a sinistra (motto piu in basso) */}
          <Link href="/" aria-label="GeoHistory Journey" className="flex items-end space-x-3">
            <Image
              src="/logo.png"
              alt="GeoHistory Journey"
              width={300}
              height={80}
              priority
              className="h-10 md:h-12 w-auto"
            />
            <span className="text-slate-600 text-xs md:text-sm italic mt-2">
              Where time and space turn into stories
            </span>
          </Link>

          {/* Menu a destra */}
          <div className="flex items-center gap-4 md:gap-6 text-sm md:text-base">
            {/* Home fissa su /module/landing */}
            <button
              onClick={goHome}
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
              type="button"
              aria-label="Home"
              title="Home"
            >
              <Home className="w-5 h-5" />
              <span className="hidden md:inline">Home</span>
            </button>

            {/* Back */}
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
              type="button"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden md:inline">Back</span>
            </button>

            {/* Settings */}
            <Link
              href="/module/settings"
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
              aria-label="Settings"
              title="Settings"
            >
              <SettingsIcon className="w-5 h-5" />
              <span className="hidden md:inline">Settings</span>
            </Link>

            {/* Intro video */}
            <button
              onClick={openVideo}
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
              type="button"
              aria-label="Guarda il video introduttivo"
              title="Guarda il video introduttivo"
            >
              <PlayCircle className="w-5 h-5" />
              <span className="hidden md:inline">Guide</span>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
              type="button"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {isVideoOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-4">
            <button
              type="button"
              className="absolute top-3 right-3 z-10 text-slate-500 hover:text-slate-900"
              aria-label="Chiudi il video"
              title="Chiudi il video"
              onClick={closeVideo}
            >
              <X className="w-5 h-5" />
            </button>

            <video
              ref={videoRef}
              className="w-full rounded-lg"
              src="/GeoHistoryVideo/GeoHistoryIntro.mp4"
              controls
              playsInline
            >
              Il tuo browser non supporta il tag video.
            </video>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center gap-3 text-slate-600">
                <Volume2 className="w-5 h-5" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="w-full accent-slate-600 cursor-pointer"
                  aria-label="Controllo del volume"
                />
                <span className="w-10 text-right text-xs font-medium">{Math.round(volume)}%</span>
              </div>

              {playbackError && (
                <p className="text-xs text-amber-600">
                  Premi play o sblocca l&apos;audio dal player per ascoltare il video.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

