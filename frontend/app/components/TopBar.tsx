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
  Maximize,
  Minimize,
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
  const [isFullscreen, setIsFullscreen] = useState(false);
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
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };

    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else {
        if (root.requestFullscreen) await root.requestFullscreen();
        else await root.webkitRequestFullscreen?.();
      }
    } catch (error) {
      console.warn('[TopBar] fullscreen toggle failed:', error);
    }
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
  const guideVideoSrc = langCode.toLowerCase().startsWith('it')
    ? '/GeoHistoryGuide/GeoHistoryGuide_IT.mp4'
    : '/GeoHistoryGuide/GeoHistoryGuide_EN.mp4';
  const mobileBarHeight = isFullscreen ? 42 : 52;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--gh-topbar-height', `${mobileBarHeight}px`);
    root.style.setProperty(
      '--gh-topbar-offset',
      isFullscreen
        ? `${mobileBarHeight}px`
        : `calc(env(safe-area-inset-top) + ${mobileBarHeight}px)`
    );
    return () => {
      root.style.removeProperty('--gh-topbar-height');
      root.style.removeProperty('--gh-topbar-offset');
    };
  }, [isFullscreen, mobileBarHeight]);

  return (
    <>
      <nav
        data-topbar
        className={`${isFullscreen ? 'fixed inset-x-0 top-0' : 'sticky top-0'} z-20 border-b border-[rgba(18,49,78,0.08)] bg-white`}
        style={{
          paddingTop: isFullscreen ? '0px' : 'env(safe-area-inset-top)',
          ['--gh-topbar-height' as string]: `${mobileBarHeight}px`,
          ['--gh-topbar-offset' as string]: isFullscreen
            ? `${mobileBarHeight}px`
            : `calc(env(safe-area-inset-top) + ${mobileBarHeight}px)`,
        }}
      >
        <div
          className="mx-auto flex max-w-[1600px] min-w-0 flex-nowrap items-center justify-between gap-1.5 px-2.5 sm:h-[74px] sm:gap-2 sm:px-4 lg:px-6"
          style={{ height: `${mobileBarHeight}px` }}
        >
          {isQuiz ? (
            <>
              <div className="flex min-w-0 items-end space-x-3">
                <Image
                  src="/logo.png"
                  alt={tUI(langCode, 'app.title')}
                  width={220}
                  height={64}
                  priority
                  className={`${isFullscreen ? 'h-7' : 'h-8'} w-auto flex-none md:h-12`}
                />
                <span className="topbar-tagline mt-2 min-w-0 flex-1 truncate text-xs italic text-[rgba(16,32,51,0.72)] md:text-sm">
                  {tUI(langCode, 'topbar.motto')}
                </span>
              </div>
              <button
                onClick={() => router.back()}
                className="inline-flex items-center justify-center rounded-full border border-[rgba(18,49,78,0.12)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--geo-navy)] transition hover:bg-white"
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
                className="flex min-w-0 items-end space-x-3"
              >
                <Image
                  src="/logo.png"
                  alt={tUI(langCode, 'app.title')}
                  width={300}
                  height={80}
                  priority
                  className="h-10 md:h-12 w-auto flex-none"
                />
                <span className="topbar-tagline mt-2 min-w-0 flex-1 truncate text-xs italic text-[rgba(16,32,51,0.72)] md:text-sm">
                  {tUI(langCode, 'topbar.motto')}
                </span>
              </Link>

              <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-1 text-sm sm:gap-2 md:gap-3 md:text-base">
                <button
                  onClick={goHome}
                  className={`inline-flex ${isFullscreen ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-full px-1.5 py-1.5 text-[var(--geo-navy)] transition hover:bg-white/70 md:h-auto md:w-auto md:gap-2 md:px-3`}
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
                  className={`inline-flex ${isFullscreen ? 'h-7 w-7' : 'h-8 w-8'} shrink-0 items-center justify-center rounded-full px-1.5 py-1.5 text-[var(--geo-navy)] transition hover:bg-white/70 md:h-auto md:w-auto md:gap-2 md:px-3`}
                  type="button"
                  aria-label={tUI(langCode, 'topbar.back')}
                  title={tUI(langCode, 'topbar.back.title')}
                >
                  <ArrowLeft className="h-6 w-6 md:h-5 md:w-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.back')}
                  </span>
                </button>

                <Link
                  href="/module/settings"
                  className={`inline-flex ${isFullscreen ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-full px-1.5 py-1.5 text-[var(--geo-navy)] transition hover:bg-white/70 md:h-auto md:w-auto md:gap-2 md:px-3`}
                  aria-label={tUI(langCode, 'topbar.settings')}
                  title={tUI(langCode, 'topbar.settings.title')}
                >
                  <SettingsIcon className="h-6 w-6 md:h-5 md:w-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.settings')}
                  </span>
                </Link>


                <Link
                  href="/about"
                  className={`hidden ${isFullscreen ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-full px-1.5 py-1.5 text-[var(--geo-navy)] transition hover:bg-white/70 sm:inline-flex md:h-auto md:w-auto md:gap-2 md:px-3`}
                  aria-label="About"
                  title="About"
                >
                  <Info className="h-6 w-6 md:h-5 md:w-5" />
                  <span className="hidden md:inline">About</span>
                </Link>

                <button
                  onClick={openVideo}
                  className={`inline-flex ${isFullscreen ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-full px-1.5 py-1.5 text-[var(--geo-navy)] transition hover:bg-white/70 md:h-auto md:w-auto md:gap-2 md:px-3`}
                  type="button"
                  aria-label={tUI(langCode, 'topbar.guide.ariaLabel')}
                  title={tUI(langCode, 'topbar.guide.title')}
                >
                  <PlayCircle className="h-6 w-6 md:h-5 md:w-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.guide')}
                  </span>
                </button>

                <button
                  onClick={toggleFullscreen}
                  className={`inline-flex ${isFullscreen ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-full px-1.5 py-1.5 text-[var(--geo-navy)] transition hover:bg-white/70 md:h-auto md:w-auto md:gap-2 md:px-3`}
                  type="button"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? <Minimize className="h-6 w-6 md:h-5 md:w-5" /> : <Maximize className="h-6 w-6 md:h-5 md:w-5" />}
                  <span className="hidden md:inline">
                    {isFullscreen ? 'Window' : 'Fullscreen'}
                  </span>
                </button>

                <button
                  onClick={handleLogout}
                  className={`inline-flex ${isFullscreen ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-full border border-[rgba(18,49,78,0.12)] bg-white/78 px-0 py-0 text-[var(--geo-navy)] shadow-[0_8px_24px_-18px_rgba(16,32,51,0.45)] transition hover:-translate-y-px hover:bg-white md:h-auto md:w-auto md:gap-2 md:px-3.5 md:py-2`}
                  type="button"
                  aria-label={tUI(langCode, 'topbar.logout')}
                  title={tUI(langCode, 'topbar.logout.title')}
                >
                  <LogOut className="h-6 w-6 md:h-5 md:w-5" />
                  <span className="hidden md:inline">
                    {tUI(langCode, 'topbar.logout')}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </nav>
      {isFullscreen ? (
        <div
          aria-hidden
          className="block md:hidden"
          style={{ height: `${mobileBarHeight}px` }}
        />
      ) : null}

      <style jsx>{`
        .topbar-tagline {
          display: inline-block;
        }

        @media (max-width: 768px), (max-height: 500px),
          (orientation: landscape) and (max-width: 900px) {
          .topbar-tagline {
            display: none;
          }
        }
      `}</style>

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
              src={guideVideoSrc}
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
