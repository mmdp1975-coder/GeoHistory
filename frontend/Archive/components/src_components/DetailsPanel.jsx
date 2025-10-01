"use client";

/* Helpers */
function toNum(n) {
  if (n === 0) return 0;
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}
function eraIsBC(era) {
  return String(era || "").trim().toUpperCase() === "BC";
}

/** usa __era se presente (calcolata in page.js), altrimenti era */
function pickEra(ev) {
  const raw = ev?.__era || ev?.era || "AD";
  return String(raw).trim().toUpperCase() === "BC" ? "BC" : "AD";
}

/** IT: a.c./d.c. — EN: BC/AD */
function fmtYearByEra(y, era, lang = "it") {
  if (y === undefined || y === null) return "";
  const it = (lang || "it").toLowerCase() === "it";
  if (it) return eraIsBC(era) ? `${y} a.c.` : `${y} d.c.`;
  return eraIsBC(era) ? `${y} BC` : `${y} AD`;
}
function fmtRangeByEra(from, to, era, lang = "it") {
  if (from !== undefined && to !== undefined) {
    if (from === to) return fmtYearByEra(from, era, lang);
    return `${fmtYearByEra(from, era, lang)} – ${fmtYearByEra(to, era, lang)}`;
  }
  if (from !== undefined) return fmtYearByEra(from, era, lang);
  if (to !== undefined)   return fmtYearByEra(to,   era, lang);
  return "";
}

/** Normalizza descrizione IT: BC/AD → a.c./d.c. */
function localizeDescription(desc, era, lang = "it") {
  if (!desc) return "";
  if ((lang || "it").toLowerCase() !== "it") return desc;
  let s = String(desc);
  s = s.replace(/\b(BCE|BC)\b/g, "a.c.");
  s = s.replace(/\b(CE|AD)\b/g, "d.c.");
  return s;
}

export default function DetailsPanel({ event, lang = "it" }) {
  if (!event) {
    return (
      <aside className="dp">
        <em className="dp-empty">
          {lang === "en" ? "Select an event to view details." : "Seleziona un evento per vedere i dettagli."}
        </em>
        <style jsx>{`
          .dp{padding:12px;color:#111827}
          .dp-empty{opacity:.7;font-style:italic}
        `}</style>
      </aside>
    );
  }

  const title =
    (lang === "en"
      ? event?.event_en ?? event?.event_it ?? event?.event
      : event?.event_it ?? event?.event_en ?? event?.event) || "";

  const from = toNum(event?.year_from);
  const to   = toNum(event?.year_to);
  const era  = pickEra(event);

  const when = fmtRangeByEra(from, to, era, lang);

  const descRaw =
    event?.description ?? event?.description_it ?? event?.description_en ?? "";
  const desc = localizeDescription(descRaw, era, lang);
  const wiki = event?.wikipedia ?? event?.wikipedia_it ?? event?.wikipedia_en ?? "";

  return (
    <aside className="dp">
      {when && <div className="dp-when">{when}</div>}
      {title && <h3 className="dp-title">{title}</h3>}
      {desc && <p className="dp-desc" style={{ whiteSpace:"pre-wrap" }}>{desc}</p>}
      {wiki && (
        <p>
          <a className="dp-wiki" href={wiki} target="_blank" rel="noreferrer">
            {lang === "en" ? "Open on Wikipedia" : "Apri su Wikipedia"}
          </a>
        </p>
      )}
      <style jsx>{`
        .dp{padding:12px;color:#111827}
        .dp-when{font-weight:600;margin-bottom:4px}
        .dp-title{margin:0 0 6px;font-size:16px;line-height:1.3}
        .dp-desc{margin:0 0 8px;opacity:.9}
        .dp-wiki{color:#2563eb;text-decoration:underline}
      `}</style>
    </aside>
  );
}
