// src/components/landing/sections/SectionSceltaIniziale.tsx
"use client";

type Props = {
  config: string[]; // array di etichette da mostrare
};

export default function SectionSceltaIniziale({ config }: Props) {
  return (
    <div className="p-4 border rounded-lg bg-white shadow mb-4">
      <h2 className="font-bold text-lg mb-3">Scelta iniziale</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {config.map((label, idx) => (
          <button
            key={idx}
            className="px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition"
            onClick={() => alert(`Hai scelto: ${label}`)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
