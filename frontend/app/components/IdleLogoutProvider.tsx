"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * IdleLogoutProvider
 * - Logout dopo 15 minuti di inattività
 * - Traccia attività su eventi window
 * - Gestisce "visibilitychange" su document
 * - Esclude pagine di auth
 * - Nessuna dipendenza da supabaseClient (niente import)
 */
type Props = { children: React.ReactNode };

const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minuti
const IGNORED_PATHS = new Set<string>([
  "/login",
  "/register",
  "/forgot-password",
]);

export default function IdleLogoutProvider({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = React.useRef<number>(Date.now());

  const trackingEnabled = React.useMemo(() => {
    if (!pathname) return true;
    const cleanPath = pathname.split("?")[0];
    return !IGNORED_PATHS.has(cleanPath);
  }, [pathname]);

  const clearIdleTimer = React.useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const startIdleTimer = React.useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      if (elapsed >= IDLE_LIMIT_MS) {
        void doLogout();
      } else {
        startIdleTimer();
      }
    }, IDLE_LIMIT_MS);
  }, [clearIdleTimer]);

  const markActivity = React.useCallback(() => {
    lastActivityRef.current = Date.now();
    startIdleTimer();
  }, [startIdleTimer]);

  const doLogout = React.useCallback(async () => {
    // 1) stop timer
    clearIdleTimer();

    try {
      // 2) best-effort: pulisci possibili tracce locali (non rompe se assenti)
      if (typeof window !== "undefined") {
        // Rimuove eventuali token locali (Supabase v1/SDK o altri)
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith("sb-") || k.includes("supabase")) {
            try {
              localStorage.removeItem(k);
            } catch {}
          }
        });
        // Notifica eventuali listeners dell'app
        window.dispatchEvent(new CustomEvent("app:forceLogout"));
      }
    } catch {
      // ignore
    } finally {
      // 3) redirect alla login
      try {
        router.push("/login?autoLogout=1");
      } catch {
        window.location.assign("/login?autoLogout=1");
      }
    }
  }, [router, clearIdleTimer]);

  const windowEvents: (keyof WindowEventMap)[] = [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
  ];

  React.useEffect(() => {
    if (!trackingEnabled) {
      clearIdleTimer();
      return;
    }

    startIdleTimer();

    windowEvents.forEach((evt) => {
      window.addEventListener(evt, markActivity, { passive: true });
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        markActivity();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearIdleTimer();
      windowEvents.forEach((evt) => {
        window.removeEventListener(evt, markActivity as EventListener);
      });
      document.removeEventListener(
        "visibilitychange",
        onVisibility as EventListener
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingEnabled, markActivity]);

  return <>{children}</>;
}
