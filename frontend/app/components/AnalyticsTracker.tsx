"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  GA_MEASUREMENT_ID,
  getGuestId,
  isAnalyticsEnabled,
  trackEvent,
  trackPageView,
} from "@/lib/analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasStartedSessionRef = useRef(false);
  const hasConfiguredAnalyticsRef = useRef(false);
  const [analyticsReady, setAnalyticsReady] = useState(false);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    if (typeof window === "undefined") return;

    window.dataLayer = window.dataLayer || [];

    if (typeof window.gtag !== "function") {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }
  }, []);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    if (typeof window === "undefined") return;

    if (typeof window.gtag === "function") {
      setAnalyticsReady(true);
      return;
    }

    const id = window.setInterval(() => {
      if (typeof window.gtag === "function") {
        setAnalyticsReady(true);
        window.clearInterval(id);
      }
    }, 250);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAnalyticsEnabled() || !analyticsReady) return;

    const guestId = getGuestId();
    const queryString = searchParams.toString();
    const pagePath = queryString ? `${pathname}?${queryString}` : pathname;

    if (!hasConfiguredAnalyticsRef.current) {
      window.gtag?.("js", new Date());
      window.gtag?.("config", GA_MEASUREMENT_ID, {
        guest_id: guestId,
      });
      hasConfiguredAnalyticsRef.current = true;
    }

    trackPageView(pagePath);

    if (!hasStartedSessionRef.current) {
      trackEvent("guest_session_start", {
        page_path: pagePath,
      });
      hasStartedSessionRef.current = true;
    }
  }, [analyticsReady, pathname, searchParams]);

  if (!isAnalyticsEnabled()) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
        onLoad={() => {
          if (typeof window !== "undefined") {
            window.dataLayer = window.dataLayer || [];

            if (typeof window.gtag !== "function") {
              window.gtag = function gtag() {
                window.dataLayer.push(arguments);
              };
            }
          }

          setAnalyticsReady(true);
        }}
      />
    </>
  );
}
