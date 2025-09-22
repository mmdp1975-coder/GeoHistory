// src/components/landing/sections/SectionOrientamento.tsx
"use client";

type Props = {
  config: any; // struttura JSON della sezione (dipende dalla persona)
};

export default function SectionOrientamento({ config }: Props) {
  return (
    <div className="p-4 border rounded-lg bg-white shadow mb-4">
      <h2 className="font-bold text-lg mb-3">Orientamento</h2>

      {/* Studente → mini tour */}
      {config?.type === "mini_tour" && (
        <div className="space-y-3">
          <p className="text-gray-700">
            Mini-tour guidato con {config?.steps ?? 3} step
          </p>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            onClick={() => alert("Mini-tour avviato")}
          >
            Avvia mini-tour
          </button>
          {config?.show_help && (
            <p className="text-sm text-gray-500">
              Suggerimenti: clicca i punti evidenziati per scoprire di più.
            </p>
          )}
        </div>
      )}

      {/* Appassionato → mappa + timeline */}
      {config?.type === "map_timeline" && (
        <div className="space-y-3">
          <p className="text-gray-700">
            Mappa + timeline ({config?.timeline_mode ?? "standard"})
          </p>
          {config?.quick_filters && (
            <div className="flex gap-2 flex-wrap">
              <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition">
                Filtra per luogo
              </button>
              <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition">
                Filtra per periodo
              </button>
              <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition">
                Filtra per tipo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ricercatore → timeline comparativa */}
      {config?.type === "compare_timeline" && (
        <div className="space-y-3">
          <p className="text-gray-700">Timeline comparativa</p>
          <div className="flex gap-2 flex-wrap">
            {config?.advanced_filters && (
              <button className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition">
                Filtri avanzati
              </button>
            )}
            {config?.export && (
              <button className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition">
                Esporta
              </button>
            )}
          </div>
        </div>
      )}

      {/* Moderatore → pannello */}
      {config?.type === "mod_panel" && (
        <div className="space-y-3">
          <p className="text-gray-700">Pannello di moderazione</p>
          <div className="flex gap-2 flex-wrap">
            {(config?.filters ?? []).map((f: string) => (
              <button
                key={f}
                className="px-3 py-1 bg-yellow-100 border rounded hover:bg-yellow-200 transition"
              >
                Filtra: {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Admin → KPI */}
      {config?.type === "kpi_top" && (
        <div className="space-y-3">
          <p className="text-gray-700">KPI principali</p>
          {config?.errors && (
            <p className="text-red-600">⚠️ Errori di sistema rilevati</p>
          )}
          {config?.moderation_queue && (
            <p className="text-gray-800">Coda moderazione: 12 elementi</p>
          )}
        </div>
      )}
    </div>
  );
}
