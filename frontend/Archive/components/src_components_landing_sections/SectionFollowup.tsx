// src/components/landing/sections/SectionFollowup.tsx
"use client";

/**
 * Sezione "Uscita / Follow-up"
 * - Studente: quiz, resume
 * - Appassionato: resume, suggest_topic, share_collection
 * - Ricercatore: publication_status, export_citations, next_tasks
 * - Moderatore: mod_report, guidelines, assign_to_admin
 * - Admin: audit_log, backup_export, landing_settings
 */
type FollowupConfig = {
  quiz?: boolean;
  resume?: boolean;
  suggest_topic?: boolean;
  share_collection?: boolean;

  publication_status?: boolean;
  export_citations?: boolean;
  next_tasks?: boolean;

  mod_report?: boolean;
  guidelines?: boolean;
  assign_to_admin?: boolean;

  audit_log?: boolean;
  backup_export?: boolean;
  landing_settings?: boolean;
};

type Props = { config: FollowupConfig };

export default function SectionFollowup({ config }: Props) {
  const actions: { label: string; visible: boolean; style?: string }[] = [
    { label: "Quiz rapido", visible: !!config.quiz, style: "bg-indigo-600 text-white hover:bg-indigo-700" },
    { label: "Riprendi da dove eri", visible: !!config.resume },
    { label: "Suggerisci un tema", visible: !!config.suggest_topic },
    { label: "Condividi raccolta", visible: !!config.share_collection },

    { label: "Stato richieste pubblicazione", visible: !!config.publication_status },
    { label: "Esporta citazioni", visible: !!config.export_citations },
    { label: "Prossimi task", visible: !!config.next_tasks },

    { label: "Report moderazione", visible: !!config.mod_report },
    { label: "Linee guida", visible: !!config.guidelines },
    { label: "Assegna ad admin", visible: !!config.assign_to_admin },

    { label: "Audit log", visible: !!config.audit_log, style: "bg-gray-800 text-white hover:bg-black" },
    { label: "Backup / Export", visible: !!config.backup_export },
    { label: "Impostazioni landing", visible: !!config.landing_settings },
  ];

  return (
    <div className="p-4 border rounded-lg bg-white shadow mb-4">
      <h2 className="font-bold text-lg mb-3">Uscita / Follow-up</h2>
      <div className="flex flex-wrap gap-2">
        {actions
          .filter((a) => a.visible)
          .map((a) => (
            <button
              key={a.label}
              className={`px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 ${a.style ?? ""}`}
              onClick={() => alert(a.label)}
            >
              {a.label}
            </button>
          ))}
      </div>
    </div>
  );
}
