// src/components/landing/sections/SectionCuriosita.tsx
"use client";

/**
 * Sezione "Curiosità / Connessioni"
 * - Legge la configurazione dal JSON (es. related_count, map_mini, graph_connections, smart_suggestions)
 * - Mostra box "Lo sapevi che...?" e collegamenti correlati (placeholder)
 * - In futuro collegheremo dati reali (eventi vicini per tempo/luogo/tipo, grafo connessioni, mappa mini)
 */

type CuriositaConfig = {
  enabled?: boolean;
  related_count?: number;
  map_mini?: boolean;
  graph_connections?: boolean;
  smart_suggestions?: boolean;
  connections?: number; // alias opzionale per related_count
  [key: string]: any;
};

type Props = {
  config: CuriositaConfig;
};

export default function SectionCuriosita({ config }: Props) {
  if (!config?.enabled) return null;

  const relatedCount =
    typeof config.related_count === "number"
      ? config.related_count
      : typeof config.connections === "number"
      ? config.connections
      : 3;

  // Placeholder "curiosità"
  const curiosities = [
    "Lo sapevi che Roma antica usava un calendario lunisolare prima della riforma giuliana?",
    "La Via Appia collegava Roma a Brindisi ed era chiamata ‘Regina Viarum’.",
    "Molti miti fondativi europei condividono elementi con leggende mediorientali più antiche.",
  ].slice(0, Math.max(1, Math.min(3, relatedCount)));

  // Placeholder eventi collegati (tempo/luogo/tipo)
  const related = Array.from({ length: relatedCount }).map((_, i) => ({
    title: `Evento correlato #${i + 1}`,
    tag: i % 2 === 0 ? "tempo vicino" : "luogo vicino",
    date: i % 2 === 0 ? "750–740 a.C." : "VIII sec. a.C.",
  }));

  return (
    <div className="p-4 border rounded-lg bg-white shadow mb-4">
      <h2 className="font-bold text-lg mb-3">Curiosità / Connessioni</h2>

      {/* Curiosità */}
      <div className="space-y-2">
        {curiosities.map((c, idx) => (
          <div
            key={idx}
            className="p-3 rounded-md border bg-amber-50 border-amber-200 text-amber-900"
          >
            <span className="font-semibold">Lo sapevi che? </span>
            <span className="text-sm">{c}</span>
          </div>
        ))}
      </div>

      {/* Connessioni correlate */}
      <div className="mt-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">
          Scopri collegati
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {related.map((r, idx) => (
            <div
              key={idx}
              className="p-3 border rounded-md hover:shadow transition bg-gray-50"
            >
              <p className="text-sm font-semibold">{r.title}</p>
              <p className="text-xs text-gray-600 mt-1">Tag: {r.tag}</p>
              <p className="text-xs text-gray-600">{r.date}</p>
              <button
                className="mt-2 px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
                onClick={() => alert(`Apri ${r.title}`)}
              >
                Apri
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Mappa mini (placeholder) */}
      {config.map_mini && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-800 mb-2">Mappa</p>
          <div className="h-40 w-full rounded-md border bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_10px,#e5e7eb_10px,#e5e7eb_20px)] flex items-center justify-center text-gray-500 text-sm">
            Mini mappa (placeholder)
          </div>
        </div>
      )}

      {/* Grafo connessioni (placeholder) */}
      {config.graph_connections && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-800 mb-2">
            Grafo connessioni
          </p>
          <div className="h-40 w-full rounded-md border bg-[radial-gradient(circle_at_20%_30%,#eef2ff,transparent_40%),radial-gradient(circle_at_70%_60%,#fef3c7,transparent_45%)] flex items-center justify-center text-gray-500 text-sm">
            Grafo interattivo (placeholder)
          </div>
        </div>
      )}

      {/* Suggerimenti smart (placeholder) */}
      {config.smart_suggestions && (
        <div className="mt-4 p-3 border rounded-md bg-green-50 border-green-200 text-green-900">
          <p className="text-sm font-semibold">
            Suggerimento intelligente
          </p>
          <p className="text-sm">
            In base a quanto esplorato, potresti approfondire “Relazioni Roma–Etruschi”.
          </p>
        </div>
      )}
    </div>
  );
}
