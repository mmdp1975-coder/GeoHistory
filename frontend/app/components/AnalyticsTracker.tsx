"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { GA_MEASUREMENT_ID, getGuestId, isAnalyticsEnabled, trackEvent } from "@/lib/analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasStartedSessionRef = useRef(false);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    const guestId = getGuestId();
    const queryString = searchParams.toString();
    const pagePath = queryString ? `${pathname}?${queryString}` : pathname;

    window.gtag?.("config", GA_MEASUREMENT_ID, {
      page_path: pagePath,
      guest_id: guestId,
    });

    if (!hasStartedSessionRef.current) {
      trackEvent("guest_session_start", {
        page_path: pagePath,
      });
      hasStartedSessionRef.current = true;
    }
  }, [pathname, searchParams]);

  if (!isAnalyticsEnabled()) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
