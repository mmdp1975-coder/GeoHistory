"use client";

import type { ComponentPropsWithoutRef, MouseEventHandler, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

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

function formatDateShort(iso?: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("it-IT", { month: "short" });
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
  ctaLabel = "Open",
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
  const publishedLabel = formatDateShort(publishedAt);
  const eventsCountLabel = eventsCount ?? 0;
  const safeAverage = typeof averageRating === "number" ? averageRating : 0;
  const safeCount = typeof ratingsCount === "number" ? ratingsCount : 0;
  const hasRating =
    typeof averageRating === "number" && typeof ratingsCount === "number" && ratingsCount > 0;
  const { className: liExtraClassName, ...restLiProps } = liProps ?? {};
  const cardClassName = mergeClassNames(
    "group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white/90 shadow transition-shadow hover:shadow-lg",
    liExtraClassName,
    className,
  );
  const favouriteStateTitle = favouriteToggleTitle ?? (isFavourite ? "Your favourite" : "Not in your favourites");
  const favouriteStateAria =
    favouriteToggleAriaLabel ??
    (onToggleFavourite ? (isFavourite ? "Remove from favourites" : "Add to favourites") : "Favourite state");
  const favouriteWrapperClassName = mergeClassNames(
    "absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/85 shadow backdrop-blur",
    favouriteToggleClassName,
  );
  const CardWrapper = ({ children }: { children: ReactNode }) => {
    if (href) {
      return (
        <Link href={href} prefetch={prefetch} className="block">
          {children}
        </Link>
      );
    }
    return (
      <button type="button" onClick={onCardClick} className="block w-full text-left">
        {children}
      </button>
    );
  };

  return (
    <li className={cardClassName} {...restLiProps}>
      <CardWrapper>
        <div className="relative h-40 w-full bg-neutral-100">
          {coverUrl ? (
            usePlainImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <Image
                src={coverUrl}
                alt={title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                priority={false}
              />
            )
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">No cover</div>
          )}

          {onToggleFavourite ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleFavourite(event);
              }}
              disabled={favouriteToggleDisabled}
              className={mergeClassNames(favouriteWrapperClassName, "hover:bg-white")}
              title={favouriteStateTitle}
              aria-label={favouriteStateAria}
            >
              {isFavourite ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="currentColor" aria-hidden>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-rose-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path d="M12.1 20.3C7.14 16.24 4 13.39 4 9.86 4 7.3 6.05 5.25 8.6 5.25c1.54 0 3.04.81 3.85 2.09.81-1.28 2.31-2.09 3.85-2.09 2.55 0 4.6 2.05 4.6 4.61 0 3.53-3.14 6.38-8.1 10.44l-.7.6-.7-.6z" />
                </svg>
              )}
            </button>
          ) : (
            <span className={favouriteWrapperClassName} title={favouriteStateTitle} aria-label={favouriteStateAria}>
              {isFavourite ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="currentColor" aria-hidden>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4 8.04 4 9.54 4.81 10.35 6.09 11.16 4.81 12.66 4 14.2 4 16.7 4 18.7 6 18.7 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-rose-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path d="M12.1 20.3C7.14 16.24 4 13.39 4 9.86 4 7.3 6.05 5.25 8.6 5.25c1.54 0 3.04.81 3.85 2.09.81-1.28 2.31-2.09 3.85-2.09 2.55 0 4.6 2.05 4.6 4.61 0 3.53-3.14 6.38-8.1 10.44l-.7.6-.7-.6z" />
                </svg>
              )}
            </span>
          )}
        </div>

        <div className="p-4">
          <div
            className="
              mb-1 grid gap-x-2
              [grid-template-columns:1fr_auto]
              [grid-template-rows:auto_auto]
              items-start
            "
          >
            <h2
              className="
                col-[1] row-[1_/_span_2]
                line-clamp-2 min-h-[2.6rem]
                text-base font-semibold leading-snug text-neutral-900
              "
              title={title}
            >
              {title}
            </h2>

            {publishedLabel && (
              <span
                className="
                  col-[2] row-[1]
                  rounded bg-neutral-100 px-2 py-[2px]
                  text-xs font-medium text-neutral-700
                  whitespace-nowrap
                "
                title="Publication date"
              >
                {publishedLabel}
              </span>
            )}

            <div className="col-[2] row-[2] mt-[2px] flex justify-end">
              {hasRating ? (
                <span className="inline-flex items-center gap-1 text-sm text-neutral-800">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-500" fill="currentColor" aria-hidden>
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  {safeAverage.toFixed(1)} ({safeCount})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-neutral-500">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden
                  >
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  ({safeCount})
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-600">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1" title="Events count">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M3 6h18v2H3V6zm2 4h14v8H5v-8zm2 2v4h10v-4H7z" />
                </svg>
                {eventsCountLabel} events
              </span>

              <span className="inline-flex items-center gap-1" title="Time span">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M12 5v14m-7-7h14" />
                </svg>
                {formatYear(yearFrom)} - {formatYear(yearTo)}
              </span>
            </div>

            {ctaLabel ? (
              <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">{ctaLabel}</span>
            ) : null}
          </div>
        </div>

        <span className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-sky-300/0 transition group-hover:ring-4 group-hover:ring-sky-300/30" />
      </CardWrapper>
    </li>
  );
}

export type { ScorecardProps };
