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
  const hasRating =
    typeof averageRating === "number" &&
    typeof ratingsCount === "number" &&
    ratingsCount > 0;

  const finalCtaLabel =
    ctaLabel ?? tUI(langCode, "scorecard.cta.open");

  const { className: liExtraClassName, ...restLiProps } = liProps ?? {};
  const cardClassName = mergeClassNames(
    "group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 hover:shadow-md transition cursor-pointer",
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
    "inline-flex items-center justify-center rounded-full bg-white/90 shadow px-2 py-1 text-xs font-medium",
    favouriteToggleClassName
  );

  const CardWrapper = ({ children }: { children: ReactNode }) => {
    if (href) {
      return (
        <Link
          href={href}
          prefetch={prefetch}
          className="block w-full h-full"
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
          className="block w-full text-left"
        >
          {children}
        </button>
      );
    }
    return <div>{children}</div>;
  };

  return (
    <li className={cardClassName} {...restLiProps}>
      <CardWrapper>
        {/* COVER */}
        <div className="relative h-40 w-full bg-neutral-100">
          {coverUrl ? (
            usePlainImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt={title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <Image
                src={coverUrl}
                alt={title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                priority={false}
              />
            )
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">
              {tUI(langCode, "scorecard.cover.missing")}
            </div>
          )}

          {/* PREFERITI – pillola in alto a destra */}
          <div className="absolute inset-x-3 top-3 flex justify-end">
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
                      fill="currentColor"
                      d="M12.1 8.3C11.5 7.5 10.5 7 9.5 7 7.6 7 6 8.6 6 10.5c0 .8.3 1.5.8 2.1L12 18l5.2-5.4c.5-.6.8-1.3.8-2.1C18 8.6 16.4 7 14.5 7c-1 0-2 .5-2.4 1.3l-.1.1-.1-.1z"
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
                ) : null}
              </span>
            )}
          </div>
        </div>

        {/* CONTENUTO */}
        <div className="flex flex-col gap-3 p-3">
          {/* Titolo + rating */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 line-clamp-2">
              {title}
            </h3>

            {hasRating ? (
              <div className="flex flex-col items-end text-xs text-neutral-600">
                <span className="font-semibold">
                  {safeAverage.toFixed(1)}
                </span>
                <span className="text-[10px]">({safeCount})</span>
              </div>
            ) : null}
          </div>

          {/* Riga date/meta + CTA */}
          <div className="grid grid-cols-[1fr,auto] grid-rows-[auto,auto] gap-1 text-xs text-neutral-600">
            {publishedLabel && (
              <span
                className="inline-flex items-center rounded bg-neutral-100 px-2 py-[2px] text-xs font-medium text-neutral-700 whitespace-nowrap"
                title={tUI(
                  langCode,
                  "scorecard.publication_date.title"
                )}
              >
                {publishedLabel}
              </span>
            )}

            <div className="col-[2] row-[2] mt-[2px] flex justify-end">
              {/* lo spazio per eventuali future badge a destra, lasciato come in origine */}
            </div>

            <div className="col-span-2 mt-2 flex items-center justify-between gap-2 text-xs text-neutral-600">
              <div className="flex flex-wrap items-center gap-3">
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
                    className="h-4 w-4"
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
                  className="inline-flex items-center gap-1"
                  title={tUI(
                    langCode,
                    "scorecard.timespan.title"
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M12 5v14m-7-7h14" />
                  </svg>
                  {formatYear(yearFrom)} - {formatYear(yearTo)}
                </span>
              </div>

              {finalCtaLabel ? (
                <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">
                  {finalCtaLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </CardWrapper>
    </li>
  );
}

export type { ScorecardProps };
