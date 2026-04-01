export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";

const GUEST_ID_STORAGE_KEY = "geohistory_guest_id";

type AnalyticsEventParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function isAnalyticsEnabled() {
  return GA_MEASUREMENT_ID.length > 0;
}

export function getGuestId() {
  if (typeof window === "undefined") return null;

  const existingGuestId = window.localStorage.getItem(GUEST_ID_STORAGE_KEY);
  if (existingGuestId) return existingGuestId;

  const guestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(GUEST_ID_STORAGE_KEY, guestId);
  return guestId;
}

export function trackEvent(eventName: string, params: AnalyticsEventParams = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function" || !isAnalyticsEnabled()) {
    return;
  }

  window.gtag("event", eventName, {
    guest_id: getGuestId(),
    ...params,
  });
}
