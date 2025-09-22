// src/components/landing/sections/SectionRaccolta.tsx
"use client";

type RaccoltaConfig =
  | { enabled?: false | undefined; [key: string]: any }
  | {
      enabled: true | "manage_spaces";
      name_it?: string;         // es. "Il mio quaderno"
      collections?: boolean;    // abilitare collezioni (Appassionato)
      tags?: boolean;           // tagging libero
      folders?: boolean;        // cartelle (Ricercatore)
      descriptions?: boolean;   // descrizioni per cartelle (Ricercatore)
      export_csv?: boolean;     // export (Ricercatore)
      [key: string]: any;
    };

type SavedItem = {
  id: string;
  title: string;
  date: string;
  note?: string;
  tags?: string[];
};

type Props = {
  config: RaccoltaConfig;
};

/**
 * Sezione "Raccolta personale"
 * - Placeholder funzionale basato sulle capacità per persona.
 * - In seguito collegheremo i dati reali (preferiti, bozze, collezioni).
 */
export default function SectionRaccolta({ config }: Props) {
  if (!config || (config as any).enabled === false) return null;

  const isManageSpaces = (config as any).enabled === "manage_spaces";

  // Dati di esempio (placeholder)
  const saved: SavedItem[] = [
    {
      id: "e1",
      title: "Battaglia di Canne",
      date: "216 a.C.",
      note: "Tattica a doppio avvolgimento di Annibale.",
      tags: ["Roma", "Cartagine", "Battaglie"],
    },
    {
      id: "e2",
      title: "Via Appia",
      date: "312 a.C.",
      note: "‘Regina Viarum’, collega Roma a Brindisi.",
      tags: ["Infrastrutture", "Roma"],
    },
    {
      id: "e3",
      title: "Editto di Milano",
      date: "313 d.C.",
      note: "Libertà di culto nell’Impero Romano.",
      tags: ["Costantino", "Cristianesimo"],
    },
  ];

  const title =
    (config as any).name_it ??
    (isManageSpaces ? "Gestione spazi e quote" : "La mia raccolta");

  return (
    <div className="p-4 border rounded-lg bg-white shadow mb-4">
      <h2 className="font-bold text-lg mb-3">{title}</h2>

      {/* Barra azioni in base alle capacità */}
      <div className="flex flex-wrap gap-2 mb-3">
        {isManageSpaces ? (
          <>
            <button className="px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-black">
              Crea spazio
            </button>
            <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
              Gestisci quote
            </button>
            <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
              Impostazioni raccolte
            </button>
          </>
        ) : (
          <>
            {(config as any).collections && (
              <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
                Nuova collezione
              </button>
            )}
            {(config as any).folders && (
              <button className="px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700">
                Nuova cartella
              </button>
            )}
            {(config as any).export_csv && (
              <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
                Esporta CSV
              </button>
            )}
          </>
        )}
      </div>

      {/* Lista elementi salvati (placeholder) */}
      <div className="grid gap-3 sm:grid-cols-3">
        {saved.map((item) => (
          <div
            key={item.id}
            className="p-3 border rounded-md bg-gray-50 hover:shadow transition"
          >
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-xs text-gray-600">{item.date}</p>
            {item.note && (
              <p className="text-xs text-gray-700 mt-1 line-clamp-3">
                {item.note}
              </p>
            )}
            {(config as any).tags && item.tags && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 text-[11px] rounded bg-emerald-100 text-emerald-800"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700">
                Apri
              </button>
              <button className="px-3 py-1.5 rounded bg-gray-200 text-xs hover:bg-gray-300">
                Rimuovi
              </button>
              {(config as any).descriptions && (
                <button className="px-3 py-1.5 rounded bg-gray-200 text-xs hover:bg-gray-300">
                  Modifica descrizione
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Editor descrizione cartella/collezione (placeholder ricercatore) */}
      {(config as any).descriptions && (
        <div className="mt-4 p-3 border rounded-md bg-white">
          <p className="text-sm font-semibold mb-2">
            Descrizione raccolta selezionata
          </p>
          <textarea
            className="w-full border rounded-md p-2 text-sm"
            rows={3}
            placeholder="Aggiungi una descrizione alla tua raccolta..."
          />
          <div className="mt-2">
            <button className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm hover:bg-black">
              Salva descrizione
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
