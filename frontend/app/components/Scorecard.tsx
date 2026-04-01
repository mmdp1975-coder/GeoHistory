"use client";

import {
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { tUI } from "@/lib/i18n/uiLabels";

type ScorecardProps = {
  href?: string;
  title: string;
  coverUrl?: string | null;
  isFavourite?: boolean | null;
  publishedAt?: string | null;
  averageRating?: number | null;
  ratingsCount?: number | null;
  eventsCount?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  hasAudio?: boolean | null;
  ctaLabel?: string | null;
  className?: string;
  prefetch?: boolean;
  liProps?: ComponentPropsWithoutRef<"li"> & Record<string, unknown>;
  onToggleFavourite?: MouseEventHandler<HTMLButtonElement>;
  favouriteToggleDisabled?: boolean;
  favouriteToggleTitle?: string;
  favouriteToggleAriaLabel?: string;
  favouriteToggleClassName?: string;
  onCardClick?: () => void;
  usePlainImg?: boolean;
  compact?: boolean;
};

function formatDateShort(iso?: string | null, langCode: string = "en") {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const normalized = (langCode ?? "en").toLowerCase();
    const locale = normalized.startsWith("it") ? "it-IT" : "en-GB";
    const month = d.toLocaleString(locale, { month: "short" });
    const year = String(d.getFullYear()).slice(-2);
    return `${day} ${month} ${year}`;
  } catch {
    return null;
  }
}

function formatYear(y?: number | null) {
  if (y === null || y === undefined) return "-";
  if (y < 0) return `${Math.abs(y)} BC`;
  return String(y);
}

function mergeClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ").trim();
}

function canUseNextImage(url?: string | null) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/");
}

function normalizeCoverUrl(raw?: string | null) {
  if (!raw) return "";
  const url = raw.trim();
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
    return url;
  }
  const withForwardSlashes = url.replace(/\\/g, "/");
  const fromPublic = withForwardSlashes.split("/public/");
  if (fromPublic.length > 1 && fromPublic[1]) {
    return encodeURI(`/${fromPublic[1]}`);
  }
  return encodeURI(withForwardSlashes);
}

export function Scorecard({
  href,
  title,
  coverUrl,
  isFavourite,
  publishedAt,
  averageRating,
  ratingsCount,
  eventsCount,
  yearFrom,
  yearTo,
  hasAudio,
  ctaLabel,
  className,
  prefetch = false,
  liProps,
  onToggleFavourite,
  favouriteToggleDisabled,
  favouriteToggleTitle,
  favouriteToggleAriaLabel,
  favouriteToggleClassName,
  onCardClick,
  usePlainImg = false,
  compact = false,
}: ScorecardProps) {
  const supabase = createClientComponentClient();
  const [langCode, setLangCode] = useState<string>("en");

  // stesso criterio di TopBar: profiles.id = auth.users.id
  useEffect(() => {
    let active = true;

    async function loadLanguage() {
      const browserLang =
        typeof window !== "undefined" ? window.navigator.language : "en";

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.warn("[Scorecard] auth.getUser error:", userError.message);
        }

        if (!user) {
          if (active) setLangCode(browserLang);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("language_code")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn(
            "[Scorecard] Error reading profiles.language_code:",
            error.message
          );
          if (active) setLangCode(browserLang);
          return;
        }

        if (!data || typeof data.language_code !== "string") {
          if (active) setLangCode(browserLang);
          return;
        }

        const dbLang = (data.language_code as string).trim() || browserLang;
        if (active) setLangCode(dbLang);
      } catch (err: any) {
        console.warn(
          "[Scorecard] Unexpected error loading language:",
          err?.message
        );
        if (active) {
          const browserLang =
            typeof window !== "undefined" ? window.navigator.language : "en";
          setLangCode(browserLang);
        }
      }
    }

    loadLanguage();

    return () => {
      active = false;
    };
  }, [supabase]);

  const publishedLabel = formatDateShort(publishedAt, langCode);
  const eventsCountLabel = eventsCount ?? 0;
  const safeAverage =
    typeof averageRating === "number" ? averageRating : 0;
  const safeCount =
    typeof ratingsCount === "number" ? ratingsCount : 0;
  const audioAvailable = !!hasAudio;
  const hasRating =
    typeof averageRating === "number" &&
    typeof ratingsCount === "number" &&
    ratingsCount > 0;

  const { className: liExtraClassName, ...restLiProps } = liProps ?? {};
  const cardClassName = mergeClassNames(
    "group relative overflow-hidden border border-[rgba(18,49,78,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,241,233,0.9))] shadow-[0_16px_42px_-32px_rgba(16,32,51,0.52)] transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(18,49,78,0.16)] hover:shadow-[0_28px_64px_-38px_rgba(16,32,51,0.58)] cursor-pointer",
    compact ? "rounded-2xl" : "h-[220px] rounded-[28px]",
    className,
    liExtraClassName
  );

  const favouriteStateTitle =
    favouriteToggleTitle ??
    (isFavourite
      ? tUI(langCode, "scorecard.favourite.state.yes")
      : tUI(langCode, "scorecard.favourite.state.no"));
  const favouriteStateAria =
    favouriteToggleAriaLabel ??
    (onToggleFavourite
      ? isFavourite
        ? tUI(langCode, "scorecard.favourite.action.remove")
        : tUI(langCode, "scorecard.favourite.action.add")
      : tUI(langCode, "scorecard.favourite.state.generic"));
  const favouriteWrapperClassName = mergeClassNames(
    "inline-flex items-center justify-center rounded-full border border-white/50 bg-white/88 px-2.5 py-1 text-xs font-medium shadow-[0_12px_28px_-18px_rgba(16,32,51,0.7)] backdrop-blur",
    favouriteToggleClassName
  );
  const showFavouriteBadge = !!onToggleFavourite || isFavourite !== null && isFavourite !== undefined;
  const showRatingBadge = !compact || hasRating;

  const CardWrapper = ({ children }: { children: ReactNode }) => {
    if (href) {
      return (
        <Link
          href={href}
          prefetch={prefetch}
          className="flex h-full w-full flex-col"
          onClick={onCardClick}
        >
          {children}
        </Link>
      );
    }
    if (onCardClick) {
      return (
        <button
          type="button"
          onClick={onCardClick}
          className="flex h-full w-full flex-col text-left"
        >
          {children}
        </button>
      );
    }
    return <div className="flex h-full w-full flex-col">{children}</div>;
  };

  return (
    <li className={cardClassName} {...restLiProps}>
      <CardWrapper>
        {/* COVER */}
        <div className={mergeClassNames("relative w-full overflow-hidden bg-neutral-100", compact ? "aspect-square" : "h-[148px]")}>
          {coverUrl ? (
            (() => {
              const browserCoverUrl = normalizeCoverUrl(coverUrl);
              const allowNextImage = !usePlainImg && canUseNextImage(browserCoverUrl);
              return allowNextImage ? (
                <Image
                  src={browserCoverUrl}
                  alt={title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  priority={false}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={browserCoverUrl || coverUrl}
                  alt={title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                  loading="lazy"
                />
              );
            })()
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">
              {tUI(langCode, "scorecard.cover.missing")}
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,18,30,0.02)_0%,rgba(8,18,30,0.08)_45%,rgba(8,18,30,0.24)_100%)]" />

          {/* AUDIO indicator (alto a sinistra) */}
          {compact && audioAvailable ? (
            <div className={compact ? "absolute left-2 top-2" : "absolute left-3 top-3"}>
              <span
                className={compact ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow" : "inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow"}
                title={
                  langCode.toLowerCase().startsWith("it")
                    ? "Audio disponibile"
                    : "Audio available"
                }
                aria-label={
                  langCode.toLowerCase().startsWith("it")
                    ? "Audio disponibile"
                    : "Audio available"
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  className={compact ? "h-3 w-3" : "h-4 w-4"}
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M5 9v6h4l5 4V5L9 9H5zm12.5 3a5.5 5.5 0 0 0-3.1-4.95l-.9 1.8A3.5 3.5 0 0 1 15.5 12a3.5 3.5 0 0 1-2 3.15l.9 1.8A5.5 5.5 0 0 0 17.5 12zm2.5 0a8 8 0 0 0-4.5-7.2l-.9 1.8A6 6 0 0 1 18 12a6 6 0 0 1-3.4 5.4l.9 1.8A8 8 0 0 0 20 12z" />
                </svg>
              </span>
            </div>
          ) : null}

          {/* PREFERITI – pillola in alto a destra */}
          {compact && showFavouriteBadge ? (
          <div className={compact ? "absolute inset-x-2 top-2 flex justify-end" : "absolute inset-x-3 top-3 flex justify-end"}>
            {onToggleFavourite ? (
              <button
                type="button"
                onClick={onToggleFavourite}
                disabled={favouriteToggleDisabled}
                title={favouriteStateTitle}
                aria-label={favouriteStateAria}
                className={favouriteWrapperClassName}
              >
                {isFavourite ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-red-500"
                    aria-hidden
                  >
                    <path
                      fill="currentColor"
                      d="M12 21s-5.7-3.4-9-7.1C1.1 12 1 10.3 1.8 9.1 2.8 7.4 4.9 6 7 6c1.5 0 3 .7 4 1.9C12 6.7 13.5 6 15 6c2.1 0 4.2 1.4 5.2 3.1.8 1.2.7 2.9-.2 3.9-3.3 3.7-9 7-9 7z"
                    />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-neutral-500"
                    aria-hidden
                  >
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      d="M12 19.5s-4.7-2.8-7.6-6c-.8-.9-.9-2.3-.3-3.4C4.8 8.3 6.1 7.5 7.5 7.5c1.1 0 2.2.5 3 1.4l1.5 1.6 1.5-1.6c.8-.9 1.9-1.4 3-1.4 1.4 0 2.7.8 3.4 1.6.6 1 .5 2.5-.3 3.4C16.7 16.7 12 19.5 12 19.5z"
                    />
                  </svg>
                )}
              </button>
            ) : (
              <span
                className={favouriteWrapperClassName}
                title={favouriteStateTitle}
                aria-label={favouriteStateAria}
              >
                {isFavourite ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-red-500"
                    aria-hidden
                  >
                    <path
                      fill="currentColor"
                      d="M12 21s-5.7-3.4-9-7.1C1.1 12 1 10.3 1.8 9.1 2.8 7.4 4.9 6 7 6c1.5 0 3 .7 4 1.9C12 6.7 13.5 6 15 6c2.1 0 4.2 1.4 5.2 3.1.8 1.2.7 2.9-.2 3.9-3.3 3.7-9 7-9 7z"
                    />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-neutral-400"
                    aria-hidden
                  >
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      d="M12 19.5s-4.7-2.8-7.6-6c-.8-.9-.9-2.3-.3-3.4C4.8 8.3 6.1 7.5 7.5 7.5c1.1 0 2.2.5 3 1.4l1.5 1.6 1.5-1.6c.8-.9 1.9-1.4 3-1.4 1.4 0 2.7.8 3.4 1.6.6 1 .5 2.5-.3 3.4C16.7 16.7 12 19.5 12 19.5z"
                    />
                  </svg>
                )}
              </span>
            )}
          </div>
          ) : null}

          {/* Rating in basso a destra */}
          {compact && showRatingBadge ? (
          <div className={compact ? "absolute bottom-1.5 right-1.5 rounded-full bg-white/90 px-1.5 py-0.5 shadow text-[10px] text-neutral-700" : "absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-1 shadow text-[11px] text-neutral-700"}>
            <span className="inline-flex items-center gap-1 font-semibold">
              {hasRating ? (
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-amber-500"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden
                >
                  <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              )}
              {safeAverage.toFixed(1)}
              <span className={compact ? "text-[9px] text-neutral-500" : "text-[10px] text-neutral-500"}>({safeCount})</span>
            </span>
          </div>
          ) : null}

          {compact ? (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent">
              <div className="px-1.5 py-1 text-[10px] font-semibold leading-tight text-white line-clamp-2">
                {title}
              </div>
            </div>
          ) : null}

          {ctaLabel ? (
            <div className={compact ? "absolute bottom-2 left-2" : "absolute left-3 top-3"}>
              <span className="inline-flex items-center rounded-full bg-[rgba(8,18,30,0.82)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow">
                {ctaLabel}
              </span>
            </div>
          ) : null}

          {!compact ? (
            <div className="absolute inset-x-3 bottom-0.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex min-w-0 items-center justify-start">
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    audioAvailable
                      ? "border-white/45 bg-white/88 text-neutral-700"
                      : "border-white/25 bg-white/58 text-neutral-500"
                  } shadow`}
                  title={
                    langCode.toLowerCase().startsWith("it")
                      ? audioAvailable
                        ? "Audio disponibile"
                        : "Audio non disponibile"
                      : audioAvailable
                        ? "Audio available"
                        : "Audio unavailable"
                  }
                  aria-label={
                    langCode.toLowerCase().startsWith("it")
                      ? audioAvailable
                        ? "Audio disponibile"
                        : "Audio non disponibile"
                      : audioAvailable
                        ? "Audio available"
                        : "Audio unavailable"
                  }
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M5 9v6h4l5 4V5L9 9H5zm12.5 3a5.5 5.5 0 0 0-3.1-4.95l-.9 1.8A3.5 3.5 0 0 1 15.5 12a3.5 3.5 0 0 1-2 3.15l.9 1.8A5.5 5.5 0 0 0 17.5 12zm2.5 0a8 8 0 0 0-4.5-7.2l-.9 1.8A6 6 0 0 1 18 12a6 6 0 0 1-3.4 5.4l.9 1.8A8 8 0 0 0 20 12z" />
                  </svg>
                </span>
              </div>

              <div className="flex items-center justify-center">
                {showRatingBadge ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow">
                    {hasRating ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-500" fill="currentColor" aria-hidden>
                        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </svg>
                    )}
                    {safeAverage.toFixed(1)}
                    <span className="text-[10px] text-neutral-500">({safeCount})</span>
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-end">
                {showFavouriteBadge ? (
                  onToggleFavourite ? (
                    <button
                      type="button"
                      onClick={onToggleFavourite}
                      disabled={favouriteToggleDisabled}
                      title={favouriteStateTitle}
                      aria-label={favouriteStateAria}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/45 bg-white/88 text-neutral-600 shadow transition hover:bg-white"
                    >
                      {isFavourite ? (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-red-500" aria-hidden>
                          <path fill="currentColor" d="M12 21s-5.7-3.4-9-7.1C1.1 12 1 10.3 1.8 9.1 2.8 7.4 4.9 6 7 6c1.5 0 3 .7 4 1.9C12 6.7 13.5 6 15 6c2.1 0 4.2 1.4 5.2 3.1.8 1.2.7 2.9-.2 3.9-3.3 3.7-9 7-9 7z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-neutral-500" aria-hidden>
                          <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M12 19.5s-4.7-2.8-7.6-6c-.8-.9-.9-2.3-.3-3.4C4.8 8.3 6.1 7.5 7.5 7.5c1.1 0 2.2.5 3 1.4l1.5 1.6 1.5-1.6c.8-.9 1.9-1.4 3-1.4 1.4 0 2.7.8 3.4 1.6.6 1 .5 2.5-.3 3.4C16.7 16.7 12 19.5 12 19.5z" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/45 bg-white/88 text-neutral-600 shadow"
                      title={favouriteStateTitle}
                      aria-label={favouriteStateAria}
                    >
                      {isFavourite ? (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-red-500" aria-hidden>
                          <path fill="currentColor" d="M12 21s-5.7-3.4-9-7.1C1.1 12 1 10.3 1.8 9.1 2.8 7.4 4.9 6 7 6c1.5 0 3 .7 4 1.9C12 6.7 13.5 6 15 6c2.1 0 4.2 1.4 5.2 3.1.8 1.2.7 2.9-.2 3.9-3.3 3.7-9 7-9 7z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-neutral-400" aria-hidden>
                          <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M12 19.5s-4.7-2.8-7.6-6c-.8-.9-.9-2.3-.3-3.4C4.8 8.3 6.1 7.5 7.5 7.5c1.1 0 2.2.5 3 1.4l1.5 1.6 1.5-1.6c.8-.9 1.9-1.4 3-1.4 1.4 0 2.7.8 3.4 1.6.6 1 .5 2.5-.3 3.4C16.7 16.7 12 19.5 12 19.5z" />
                        </svg>
                      )}
                    </span>
                  )
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* CONTENUTO */}
        {!compact ? (
        <div className={compact ? "flex flex-col gap-1 p-1.5" : "flex min-h-0 flex-1 flex-col gap-1.5 px-3 py-2.5"}>
          {/* Titolo + data */}
          <div className={compact ? "flex items-start justify-between gap-2" : "flex min-h-[35px] items-start justify-between gap-2"}>
            <h3 className={compact ? "text-[11px] font-semibold text-neutral-900 line-clamp-1" : "min-h-[35px] overflow-hidden text-[13px] font-semibold leading-[1.35] text-[var(--geo-navy)] line-clamp-2"}>
              {title}
            </h3>

            {!compact && publishedLabel && (
              <span
                className="mt-[1px] inline-flex whitespace-nowrap rounded-full border border-[rgba(18,49,78,0.08)] bg-[rgba(255,255,255,0.72)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[rgba(16,32,51,0.54)]"
                title={tUI(
                  langCode,
                  "scorecard.publication_date.title"
                )}
              >
                {publishedLabel}
              </span>
            )}
          </div>

          {/* Riga date/meta */}
          <div className={compact ? "mt-0 flex items-center justify-end text-[10px] text-neutral-600" : "text-[10px] text-[rgba(16,32,51,0.62)]"}>
            {!compact ? (
            <div className="hidden">
              {/* lo spazio per eventuali future badge a destra, lasciato come in origine */}
            </div>
            ) : null}

              <div className={compact ? "flex items-center justify-end" : "mt-0 flex items-center justify-between gap-2 text-[10px] text-[rgba(16,32,51,0.62)]"}>
                {!compact ? (
              <div className="flex w-full items-center justify-between gap-2.5">
                {/* Numero eventi */}
                <span
                  className="inline-flex items-center gap-1"
                  title={tUI(
                    langCode,
                    "scorecard.events.count_title"
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M3 6h18v2H3V6zm2 4h14v8H5v-8zm2 2v4h10v-4H7z" />
                  </svg>
                  {eventsCountLabel}{" "}
                  {tUI(langCode, "scorecard.events.count_suffix")}
                </span>

                {/* Arco temporale */}
                <span
                  className="inline-flex items-center justify-end gap-1 text-right"
                  title={tUI(
                    langCode,
                    "scorecard.timespan.title"
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M12 5v14m-7-7h14" />
                  </svg>
                  {formatYear(yearFrom)} - {formatYear(yearTo)}
                </span>
              </div>
              ) : null}
            </div>

          </div>
        </div>
        ) : null}
      </CardWrapper>
    </li>
  );
}

export type { ScorecardProps };
