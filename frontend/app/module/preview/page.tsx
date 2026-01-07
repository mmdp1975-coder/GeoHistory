"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type PreviewStep = "video" | "timeline" | "journey";

type LocaleKey = "it" | "en";

export default function PreviewPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasAttemptedPlay = useRef(false);
  const startedRef = useRef(false);
  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const timelineFrameRef = useRef<HTMLIFrameElement | null>(null);
  const timelineScrollRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const journeyFrameRef = useRef<HTMLIFrameElement | null>(null);
  const journeyScrollRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const journeyReloadRef = useRef(0);
  const [step, setStep] = useState<PreviewStep>("video");
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoSrc, setVideoSrc] = useState("/GHJLogin/GHJLogin_EN.mp4");
  const [locale, setLocale] = useState<LocaleKey>("en");
  const [journeySrc, setJourneySrc] = useState(
    "/module/group_event?gid=e5ca79b3-38b0-4de2-8cd1-bc1d949a4342&preview=1"
  );

  const labels = useMemo(() => {
    if (locale === "it") {
      return {
        skip: "Salta anteprima",
        mute: "Muta audio",
        unmute: "Attiva audio",
        replay: "Ricomincia anteprima",
        login: "Accedi",
        signup: "Registrati",
        endTitle: "Anteprima terminata",
        endBody: "Tra un attimo verrai reindirizzato al login.",
      };
    }
    return {
      skip: "Skip preview",
      mute: "Mute audio",
      unmute: "Unmute audio",
      replay: "Replay preview",
      login: "Log in",
      signup: "Sign up",
      endTitle: "Preview ended",
      endBody: "Redirecting to login in a moment.",
    };
  }, [locale]);

  const clearAllTimeouts = () => {
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
  };

  const clearTimelineScrollTimeouts = () => {
    timelineScrollRef.current.forEach((id) => clearTimeout(id));
    timelineScrollRef.current = [];
  };

  const clearJourneyScrollTimeouts = () => {
    journeyScrollRef.current.forEach((id) => clearTimeout(id));
    journeyScrollRef.current = [];
  };

  const scheduleTimeout = (callback: () => void, delayMs: number) => {
    const id = setTimeout(callback, delayMs);
    timeoutsRef.current.push(id);
  };

  const startSequence = () => {
    clearAllTimeouts();
    setStep("video");
  };

  useEffect(() => {
    const primary = (navigator.language || "en").toLowerCase();
    const isItalian = primary.startsWith("it");
    setLocale(isItalian ? "it" : "en");
    setVideoSrc(isItalian ? "/GHJLogin/GHJLogin_IT.mp4" : "/GHJLogin/GHJLogin_EN.mp4");
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startSequence();

    return () => {
      clearAllTimeouts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.load();
    el.play().catch(() => {
      /* autoplay can be blocked until user interacts */
    });
  }, [videoSrc]);

  useEffect(() => {
    if (!startedRef.current) return;
    clearAllTimeouts();

    if (step === "video") {
      scheduleTimeout(() => setStep("timeline"), 8000);
    } else if (step === "timeline") {
      scheduleTimeout(() => setStep("journey"), 5000);
    } else if (step === "journey") {
      journeyReloadRef.current += 1;
      setJourneySrc(
        `/module/group_event?gid=e5ca79b3-38b0-4de2-8cd1-bc1d949a4342&preview=1&_t=${Date.now()}`
      );
      scheduleTimeout(() => setStep("timeline"), 10000);
    }

    return () => {
      clearAllTimeouts();
    };
  }, [step]);

  useEffect(() => {
    clearTimelineScrollTimeouts();
    if (step !== "timeline") return;

    const scrollTimeline = () => {
      const iframe = timelineFrameRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const win = iframe.contentWindow;
        if (!doc || !win) return;
        const maxScroll = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
        if (maxScroll <= 0) return;

        win.scrollTo({ top: Math.min(maxScroll, 600), behavior: "smooth" });
        timelineScrollRef.current.push(
          setTimeout(() => {
            win.scrollTo({ top: 0, behavior: "smooth" });
          }, 2000)
        );
      } catch {
        /* ignore cross-origin/scroll issues */
      }
    };

    timelineScrollRef.current.push(setTimeout(scrollTimeline, 800));

    return () => {
      clearTimelineScrollTimeouts();
    };
  }, [step]);

  useEffect(() => {
    clearJourneyScrollTimeouts();
    if (step !== "journey") return;

    const runEventSequence = () => {
      const iframe = journeyFrameRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const win = iframe.contentWindow;
        if (!doc || !win) return;

        const controlLabels = [
          "Next",
          "Previous",
          "Play",
          "Pause",
          "Schermo intero",
          "Riduci mappa",
          "Evento precedente",
          "Evento successivo",
          "Ferma autoplay",
          "Avvia autoplay",
        ];

        const containers = Array.from(doc.querySelectorAll<HTMLElement>("div, section, article"));
        const eventHeading = Array.from(
          doc.querySelectorAll<HTMLElement>("h1,h2,h3,h4,div,span")
        ).find((el) => (el.textContent || "").trim() === "Eventi");

        let pickContainer: HTMLElement | undefined;
        if (eventHeading) {
          const parent = eventHeading.closest("section,div,article") as HTMLElement | null;
          if (parent) {
            const eventContainer = parent.querySelector<HTMLElement>("div,section,article");
            pickContainer = eventContainer || parent;
          }
        }

        if (!pickContainer) {
          pickContainer =
            containers.find((el) => {
              const style = win.getComputedStyle(el);
              return (
                (style.overflowX === "auto" || style.overflowX === "scroll") &&
                el.scrollWidth > el.clientWidth + 40
              );
            }) || containers[0];
        }

        if (!pickContainer) return;

        const buttonRoot =
          pickContainer.querySelector<HTMLElement>("div[style*='overflow-x'], div, section, article") ||
          pickContainer;

        const isEventButton = (btn: HTMLButtonElement) => {
          const text = (btn.textContent || "").trim();
          if (!text) return false;
          if (controlLabels.some((label) => text.includes(label))) return false;
          const rect = btn.getBoundingClientRect();
          const sizeMatch = rect.height >= 44 && rect.height <= 90 && rect.width >= 140;
          const hasIndexBadge = Array.from(btn.querySelectorAll("div,span")).some((el) => {
            const t = (el.textContent || "").trim();
            return /^\d+$/.test(t) && t.length <= 2;
          });
          return sizeMatch && hasIndexBadge;
        };

        const buttons = Array.from(buttonRoot.querySelectorAll<HTMLButtonElement>("button"))
          .filter(isEventButton)
          .sort((a, b) => a.offsetLeft - b.offsetLeft)
          .slice(0, 10);

        buttons.forEach((btn, index) => {
          journeyScrollRef.current.push(
            setTimeout(() => {
              btn.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
              const scrollParent = btn.closest<HTMLElement>("div");
              if (scrollParent && scrollParent.scrollWidth > scrollParent.clientWidth) {
                scrollParent.scrollLeft = btn.offsetLeft - scrollParent.clientWidth / 2;
              }
              btn.click();
            }, index * 1200)
          );
        });
      } catch {
        /* ignore cross-origin/scroll issues */
      }
    };

    const waitForJourney = (attempt = 0) => {
      const iframe = journeyFrameRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const loadingText = doc.body?.innerText?.includes("Loading Journey.");
        if (!loadingText) {
          runEventSequence();
          return;
        }
      } catch {
        /* ignore cross-origin/DOM issues */
      }
      if (attempt < 10) {
        journeyScrollRef.current.push(setTimeout(() => waitForJourney(attempt + 1), 600));
      }
    };

    journeyScrollRef.current.push(setTimeout(() => waitForJourney(), 600));

    return () => {
      clearJourneyScrollTimeouts();
    };
  }, [step]);

  useEffect(() => {
    document.body.classList.add("preview-mode");
    return () => {
      document.body.classList.remove("preview-mode");
    };
  }, []);

  const handleSkip = () => {
    clearAllTimeouts();
    window.location.assign("/login");
  };

  return (
    <div className="page">
      <div className={`layer videoLayer ${step === "video" ? "visible" : ""}`} aria-hidden="true">
        <video
          key={videoSrc}
          ref={videoRef}
          className="video"
          autoPlay
          preload="auto"
          muted={videoMuted}
          loop
          controls={false}
          disablePictureInPicture
          playsInline
          aria-hidden="true"
          onLoadedData={() => {
            if (hasAttemptedPlay.current) return;
            hasAttemptedPlay.current = true;
            try {
              const playPromise = videoRef.current?.play();
              if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => {
                  /* autoplay can be blocked until user interacts */
                });
              }
            } catch {
              /* autoplay can be blocked until user interacts */
            }
          }}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        <div className="veil" />
        <div className="logoOverlay" aria-hidden="true">
          <Image
            className="logoOverlayImage"
            src="/logo/logo_white_transparent.png"
            alt=""
            width={220}
            height={220}
            sizes="(max-width: 900px) 28vw, 180px"
            priority
          />
        </div>
      </div>

      <div className={`layer frameLayer ${step === "timeline" ? "visible" : ""}`}>
        <iframe
          title="Timeline preview"
          className="previewFrame"
          src="/module/timeline?preview=1"
          allow="fullscreen; autoplay"
          ref={timelineFrameRef}
        />
      </div>

      <div className={`layer frameLayer ${step === "journey" ? "visible" : ""}`}>
        <iframe
          title="Journey preview"
          className="previewFrame"
          src={journeySrc}
          allow="fullscreen; autoplay"
          ref={journeyFrameRef}
        />
      </div>

      <div className="floatingControls">
        <button type="button" className="skipBtn" onClick={handleSkip} aria-label={labels.skip}>
          {locale === "it" ? "Salta" : "Skip"}
        </button>
        <button
          type="button"
          className="audioToggle"
          onClick={() => setVideoMuted((prev) => !prev)}
          aria-pressed={!videoMuted}
          aria-label={videoMuted ? labels.unmute : labels.mute}
        >
          {videoMuted ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M3 9v6h4l5 4V5L7 9H3Z" fill="currentColor" fillOpacity="0.9" />
              <path
                d="m16 9 5 5m0-5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M3 9v6h4l5 4V5L7 9H3Z" fill="currentColor" fillOpacity="0.9" />
              <path
                d="M16 9.5c1 .8 1.5 1.8 1.5 2.5s-.5 1.7-1.5 2.5m2.5-6.5c1.5 1.2 2.5 2.7 2.5 4s-1 2.8-2.5 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}
        </button>
      </div>

      <style jsx>{`
        :global(body.preview-mode header),
        :global(body.preview-mode nav),
        :global(body.preview-mode .topbar),
        :global(body.preview-mode .app-header),
        :global(body.preview-mode .site-header),
        :global(body.preview-mode .navbar),
        :global(body.preview-mode [data-topbar]) {
          display: none !important;
        }

        .page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: #050608;
          color: #f7f4ef;
          font-family: "Spectral", "Georgia", serif;
        }

        .layer {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.7s ease;
          pointer-events: none;
        }

        .layer.visible {
          opacity: 1;
          pointer-events: auto;
        }

        .videoLayer {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .veil {
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, rgba(5, 6, 8, 0.65), rgba(10, 12, 18, 0.55));
          z-index: 1;
        }

        .logoOverlay {
          position: absolute;
          left: 5vw;
          bottom: 6vh;
          z-index: 2;
          opacity: 0.7;
        }

        .logoOverlayImage {
          width: clamp(120px, 18vw, 200px);
          height: auto;
        }

        .previewFrame {
          position: absolute;
          inset: 0;
          width: 100vw;
          height: 100vh;
          border: 0;
          background: #000;
          z-index: 2;
        }

        .floatingControls {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 5;
          display: flex;
          gap: 10px;
        }

        .skipBtn {
          border: 1px solid rgba(247, 244, 239, 0.35);
          background: rgba(10, 12, 18, 0.7);
          color: #f7f4ef;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 14px;
          cursor: pointer;
        }

        .audioToggle {
          border: 1px solid rgba(247, 244, 239, 0.35);
          background: rgba(10, 12, 18, 0.7);
          color: #f7f4ef;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        @media (max-width: 720px) {
          .logoOverlay {
            left: 4vw;
            bottom: 4vh;
          }

          .endActions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
