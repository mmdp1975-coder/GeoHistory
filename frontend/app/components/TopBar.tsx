// frontend/app/components/TopBar.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Home,
  ArrowLeft,
  Settings as SettingsIcon,
  LogOut,
  PlayCircle,
  X,
  Volume2,
  Info,
} from 'lucide-react';
import { tUI } from '@/lib/i18n/uiLabels';

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClientComponentClient();

  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [volume, setVolume] = useState(100);
  const [shouldAutoplay, setShouldAutoplay] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 👉 lingua usata per le label UI
  const [langCode, setLangCode] = useState<string>('en');

  // Carica language_code dal profilo:
  // usa esattamente la stessa logica di Settings:
  // profiles.id = auth.users.id
  useEffect(() => {
    let active = true;

    async function loadLanguage() {
      const browserLang =
        typeof window !== 'undefined' ? window.navigator.language : 'en';

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.warn('[TopBar] auth.getUser error:', userError.message);
        }

        if (!user) {
          if (active) {
            console.log('[TopBar] Nessun utente: uso lingua browser:', browserLang);
            setLangCode(browserLang);
          }
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('language_code')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.warn('[TopBar] Errore leggendo profiles.language_code:', error.message);
          if (active) {
            console.log('[TopBar] Uso lingua browser come fallback:', browserLang);
            setLangCode(browserLang);
          }
          return;
        }

        if (!data || typeof data.language_code !== 'string') {
          console.log(
            '[TopBar] Nessun language_code definito sul profilo: uso lingua browser:',
            browserLang
          );
          if (active) setLangCode(browserLang);
          return;
        }

        const dbLang = (data.language_code as string).trim();

        if (active) {
          console.log('[TopBar] language_code usato dalla TopBar:', dbLang);
          setLangCode(dbLang);
        }
      } catch (err: any) {
        console.warn('[TopBar] Errore imprevisto caricando la lingua:', err?.message);
        if (active) {
          console.log('[TopBar] Uso lingua browser come fallback:', browserLang);
          setLangCode(
            typeof window !== 'undefined' ? window.navigator.language : 'en'
          );
        }
      }
    }

    loadLanguage();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.push('/login');
    }
  }

  function goHome() {
    router.push('/module/landing');
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
    if (!isVideoOpen || !videoRef.current) return;

    const normalizedVolume = volume / 100;
    videoRef.current.volume = normalizedVolume;
    videoRef.current.muted = normalizedVolume === 0;
  }, [volume, isVideoOpen]);

  useEffect(() => {
    if (!isVideoOpen || !shouldAutoplay || !videoRef.current) return;

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

  const isQuiz = pathname?.startsWith('/module/quiz');

  return (
    <>
      <nav className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
          {isQuiz ? (
            <>
              <div className="flex items-end space-x-3">
                <Image
                  src="/logo.png"
                  alt={tUI(langCode, 'app.title')}
                  width={220}
                  height={64}
                  priority
                  className="h-10 md:h-12 w-auto"
                />
                <span className="hidden md:inline text-slate-600 text-xs md:text-sm italic mt-2">
                  {tUI(langCode, 'topbar.motto')}
                </span>
              </div>
              <button
                onClick={() => router.back()}
                className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900"
                type="button"
                aria-label="Chiudi"
                title="Chiudi"
              >
                Chiudi
              </button>
            </>
          ) : (
            <>
              <Link
                href="/"
                aria-label={tUI(langCode, 'topbar.logo.ariaLabel')}
                className="flex items-end space-x-3"
              >
                <Image
                  src="/logo.png"
                  alt={tUI(langCode, 'app.title')}
                  width={300}
                  height={80}
                  priority
                  className="h-10 md:h-12 w-auto"
                />
                <span className="hidden md:inline text-slate-600 text-xs md:text-sm italic mt-2">
                  {tUI(langCode, 'topbar.motto')}
                </span>
              </Link>

              <div className="flex items-center gap-4 md:gap-6 text-sm md:text-base">
                <button
                  onClick={goHome}
                  className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
                  type="button"
                  aria-label={tUI(langCode, 'topbar.home')}
                  title={tUI(langCode, 'topbar.home.title')}
                >
                  <Home className="w-5 h-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.home')}
                  </span>
                </button>

                <button
                  onClick={() => router.back()}
                  className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
                  type="button"
                  aria-label={tUI(langCode, 'topbar.back')}
                  title={tUI(langCode, 'topbar.back.title')}
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.back')}
                  </span>
                </button>

                <Link
                  href="/module/settings"
                  className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
                  aria-label={tUI(langCode, 'topbar.settings')}
                  title={tUI(langCode, 'topbar.settings.title')}
                >
                  <SettingsIcon className="w-5 h-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.settings')}
                  </span>
                </Link>


                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
                  aria-label="About"
                  title="About"
                >
                  <Info className="w-5 h-5" />
                  <span className="hidden md:inline">About</span>
                </Link>

                <button
                  onClick={openVideo}
                  className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
                  type="button"
                  aria-label={tUI(langCode, 'topbar.guide.ariaLabel')}
                  title={tUI(langCode, 'topbar.guide.title')}
                >
                  <PlayCircle className="w-5 h-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.guide')}
                  </span>
                </button>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
                  type="button"
                  aria-label={tUI(langCode, 'topbar.logout')}
                  title={tUI(langCode, 'topbar.logout.title')}
                >
                  <LogOut className="w-5 h-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.logout')}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      {isVideoOpen && !isQuiz && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-4">
            <button
              type="button"
              className="absolute top-3 right-3 z-10 text-slate-500 hover:text-slate-900"
              aria-label={tUI(langCode, 'video.close.ariaLabel')}
              title={tUI(langCode, 'video.close.title')}
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
              {tUI(langCode, 'video.unsupported')}
            </video>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center gap-3 text-slate-600">
                <Volume2 className="w-5 h-5" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(event) =>
                    setVolume(Number(event.target.value))
                  }
                  className="w-full accent-slate-600 cursor-pointer"
                  aria-label={tUI(langCode, 'video.volume.label')}
                />
                <span className="w-10 text-right text-xs font-medium">
                  {Math.round(volume)}%
                </span>
              </div>

              {playbackError && (
                <p className="text-xs text-amber-600">
                  {tUI(langCode, 'video.playbackError')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
