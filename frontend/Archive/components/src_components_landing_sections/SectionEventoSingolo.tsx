// src/components/landing/sections/SectionEventoSingolo.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  config: {
    card?: "simple" | "standard" | "extended" | "moderation" | "admin";
    show_date_range?: boolean;
    show_image?: boolean;
    show_wikipedia?: boolean;
    sources?: boolean;
    citations?: boolean;
    coords?: boolean;
    // Facoltativi in futuro (filtri/ordinamenti)
    // filter?: { ... };
    // orderBy?: string;
    // limit?: number;
    [key: string]: any;
  };
};

// Tipo “elastico” perché non conosciamo esattamente lo schema di events_list
type AnyRecord = Record<string, any>;

/**
 * Sezione "Evento singolo" (versione con dati reali)
 * - Legge 1 evento da `events_list`
 * - Mappa i campi in modo robusto (fallback multipli per title/description/date/image ecc.)
 * - Mantiene i layout card: simple | standard | extended | moderation | admin
 */
export default function SectionEventoSingolo({ config }: Props) {
  const {
    card = "standard",
    show_date_range = true,
    show_image = true,
    show_wikipedia = true,
    sources = false,
    citations = false,
    coords = false,
  } = config || {};

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<AnyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Carica 1 evento da events_list
  useEffect(() => {
    let isMounted = true;

    const fetchOne = async () => {
      setLoading(true);
      setError(null);

      // Strategia semplice: prendo “l’ultimo” in base a una colonna comune.
      // Non conoscendo lo schema, usiamo select("*") e poi ordiniamo lato client se serve.
      const { data, error } = await supabase.from("events_list").select("*").limit(1);

      if (!isMounted) return;

      if (error) {
        setError(error.message ?? "Errore caricamento events_list");
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setError("Nessun evento disponibile in events_list.");
        setLoading(false);
        return;
      }

      setRow(data[0]);
      setLoading(false);
    };

    fetchOne();

    return () => {
      isMounted = false;
    };
  }, []);

  // Mappatura robusta dei campi (fallback su nomi possibili)
  const mapped = useMemo(() => {
    const r = row || {};

    const id =
      r.id ?? r.event_id ?? r.uuid ?? r.slug ?? Math.random().toString(36).slice(2);
    const title =
      r.title ?? r.name ?? r.event_title ?? r.label ?? "Untitled event";
    const subtitle =
      r.subtitle ?? r.summary ?? r.short_description ?? r.type ?? "";
    const description =
      r.description ??
      r.long_description ??
      r.content ??
      r.body ??
      "—";

    // Date: converto in stringhe leggibili, accetto vari alias
    const fromRaw =
      r.date_from ?? r.start_date ?? r.start ?? r.from ?? r.begin ?? null;
    const toRaw =
      r.date_to ?? r.end_date ?? r.finish ?? r.to ?? r.end ?? fromRaw ?? null;

    const dateFrom =
      typeof fromRaw === "string"
        ? fromRaw
        : fromRaw instanceof Date
        ? fromRaw.toISOString()
        : fromRaw?.toString() ?? "";
    const dateTo =
      typeof toRaw === "string"
        ? toRaw
        : toRaw instanceof Date
        ? toRaw.toISOString()
        : toRaw?.toString() ?? "";

    // Immagini: provo diversi nomi
    const image =
      r.image_url ??
      r.image ??
      r.cover ??
      r.thumbnail ??
      r.photo ??
      null;

    // Wikipedia / fonti
    const wikipedia =
      r.wikipedia_url ?? r.wikipedia ?? r.source_url ?? r.url ?? null;

    // Coordinate
    const lat = r.lat ?? r.latitude ?? null;
    const lng = r.lng ?? r.longitude ?? r.lon ?? null;

    // Liste fonti/citazioni se presenti
    const sourceList =
      r.sources ??
      r.source_list ??
      r.fonti ??
      (r.source ? [r.source] : []) ??
      [];
    const citationList =
      r.citations ??
      r.citation_list ??
      r.citazioni ??
      (r.citation ? [r.citation] : []) ??
      [];

    return {
      id,
      title,
      subtitle,
      description,
      dateFrom,
      dateTo,
      image,
      wikipedia,
      lat,
      lng,
      sourceList: Array.isArray(sourceList) ? sourceList : [],
      citationList: Array.isArray(citationList) ? citationList : [],
    };
  }, [row]);

  const renderHeader = () => (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <h3 className="text-lg font-semibold leading-tight">{mapped.title}</h3>
        {mapped.subtitle && (
          <p className="text-sm text-gray-600">{mapped.subtitle}</p>
        )}
        {show_date_range && (mapped.dateFrom || mapped.dateTo) && (
          <p className="mt-1 text-sm text-gray-800">
            <span className="font-medium">Dal–Al:</span>{" "}
            {mapped.dateFrom || "?"}
            {mapped.dateTo && mapped.dateTo !== mapped.dateFrom
              ? ` → ${mapped.dateTo}`
              : ""}
          </p>
        )}
      </div>
      {show_image && mapped.image && (
        <img
          src={mapped.image}
          alt={mapped.title}
          className="w-28 h-20 object-cover rounded-md border"
        />
      )}
    </div>
  );

  const renderBodyStandard = () => (
    <>
      <p className="text-sm text-gray-800">{mapped.description}</p>
      <div className="flex items-center gap-3 text-sm mt-2">
        {show_wikipedia && mapped.wikipedia && (
          <a
            href={mapped.wikipedia}
            target="_blank"
            rel="noreferrer"
            className="underline text-blue-700"
          >
            Wikipedia
          </a>
        )}
        {coords && mapped.lat != null && mapped.lng != null && (
          <span className="text-gray-600">
            📍 {Number(mapped.lat).toFixed(4)}, {Number(mapped.lng).toFixed(4)}
          </span>
        )}
      </div>
    </>
  );

  const renderBodyExtended = () => (
    <>
      {renderBodyStandard()}
      {sources && mapped.sourceList.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold">Fonti</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-800">
            {mapped.sourceList.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {citations && mapped.citationList.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold">Citazioni</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-800">
            {mapped.citationList.map((c: string, i: number) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  const renderBodyModeration = () => (
    <>
      {renderBodyStandard()}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="p-3 border rounded-md">
          <p className="text-sm font-semibold">Diff</p>
          <p className="text-xs text-gray-600 mt-1">
            — placeholder diff contenuto —
          </p>
        </div>
        <div className="p-3 border rounded-md">
          <p className="text-sm font-semibold">Checklist</p>
          <ul className="mt-1 text-xs text-gray-700 list-disc pl-4">
            <li>Fonti presenti</li>
            <li>Coordinate (se previste)</li>
            <li>Date coerenti</li>
          </ul>
        </div>
        <div className="p-3 border rounded-md">
          <p className="text-sm font-semibold">Log</p>
          <p className="text-xs text-gray-600 mt-1">— placeholder log —</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700">
          Approva
        </button>
        <button className="px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700">
          Respingi
        </button>
        <button className="px-3 py-1.5 rounded bg-yellow-500 text-white hover:bg-yellow-600">
          Rimanda a revisione
        </button>
      </div>
    </>
  );

  const renderBodyAdmin = () => (
    <>
      {renderBodyStandard()}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="p-3 border rounded-md">
          <p className="text-sm font-semibold">History</p>
          <ul className="mt-1 text-xs text-gray-700 list-disc pl-4">
            <li>— placeholder history —</li>
          </ul>
        </div>
        <div className="p-3 border rounded-md">
          <p className="text-sm font-semibold">Permessi</p>
          <ul className="mt-1 text-xs text-gray-700 list-disc pl-4">
            <li>— placeholder permessi —</li>
          </ul>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-black">
          Apri impostazioni
        </button>
        <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
          Esporta JSON
        </button>
      </div>
    </>
  );

  const renderBodyByType = () => {
    switch (card) {
      case "simple":
      case "standard":
        return renderBodyStandard();
      case "extended":
        return renderBodyExtended();
      case "moderation":
        return renderBodyModeration();
      case "admin":
        return renderBodyAdmin();
      default:
        return renderBodyStandard();
    }
  };

  if (loading) {
    return (
      <div className="p-4 border rounded-lg bg-white shadow mb-4">
        <h2 className="font-bold text-lg mb-3">Evento singolo</h2>
        <p className="text-sm text-gray-600">Caricamento evento…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border rounded-lg bg-white shadow mb-4">
        <h2 className="font-bold text-lg mb-3">Evento singolo</h2>
        <p className="text-sm text-red-700">Errore: {error}</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="p-4 border rounded-lg bg-white shadow mb-4">
        <h2 className="font-bold text-lg mb-3">Evento singolo</h2>
        <p className="text-sm text-gray-600">Nessun evento trovato.</p>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg bg-white shadow mb-4">
      <h2 className="font-bold text-lg mb-3">Evento singolo</h2>
      {renderHeader()}
      <div className="mt-3">{renderBodyByType()}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => alert(`Apri dettaglio evento #${mapped.id}`)}
        >
          Apri dettaglio
        </button>
        <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
          Aggiungi ai preferiti
        </button>
      </div>
    </div>
  );
}
