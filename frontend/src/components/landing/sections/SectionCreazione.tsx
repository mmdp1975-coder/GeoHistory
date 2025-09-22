// src/components/landing/sections/SectionCreazione.tsx
"use client";

/**
 * Sezione "Creazione"
 * - Comportamenti:
 *   - student / enthusiast: type = "note_only" | "duplicate_private" → creazione solo personale
 *   - researcher: type = "create_edit", public_allowed = "by_request"
 *   - moderator: type = "validate_reject" (strumenti moderazione)
 *   - admin: type = "all" (tutto)
 */
type CreazioneConfig = {
  type:
    | "note_only"
    | "duplicate_private"
    | "create_edit"
    | "validate_reject"
    | "all";
  public_allowed?: boolean | "by_request";
  system_settings?: boolean;
  comments?: boolean;
};

type Props = {
  config: CreazioneConfig;
};

export default function SectionCreazione({ config }: Props) {
  const t = config?.type;

  const renderNoteOnly = () => (
    <div className="space-y-3">
      <p className="text-gray-700 text-sm">
        Crea una <strong>nota personale</strong> collegata all’evento selezionato.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
          Aggiungi nota
        </button>
        <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
          Aggiungi flashcard
        </button>
      </div>
    </div>
  );

  const renderDuplicatePrivate = () => (
    <div className="space-y-3">
      <p className="text-gray-700 text-sm">
        Duplica un evento in <strong>bozza privata</strong> e annotalo.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
          Duplica in bozza
        </button>
        <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
          Apri bozze personali
        </button>
      </div>
    </div>
  );

  const renderCreateEdit = () => (
    <div className="space-y-3">
      <p className="text-gray-700 text-sm">
        Crea o modifica un <strong>Group Event</strong>. Pubblicazione{" "}
        {config.public_allowed === "by_request"
          ? "su richiesta (con approvazione)."
          : config.public_allowed
          ? "consentita."
          : "non consentita."}
      </p>
      <div className="flex gap-2 flex-wrap">
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
          Nuovo Group Event
        </button>
        <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
          Le mie bozze
        </button>
        <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
          Invia per revisione
        </button>
      </div>
    </div>
  );

  const renderValidateReject = () => (
    <div className="space-y-3">
      <p className="text-gray-700 text-sm">Strumenti di moderazione.</p>
      <div className="flex gap-2 flex-wrap">
        {config.comments && (
          <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
            Aggiungi commento
          </button>
        )}
        <button className="px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700">
          Valida
        </button>
        <button className="px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700">
          Respingi
        </button>
      </div>
    </div>
  );

  const renderAll = () => (
    <div className="space-y-3">
      <p className="text-gray-700 text-sm">
        Accesso completo a creazione, pubblicazione e impostazioni di sistema.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
          Nuovo Group Event
        </button>
        <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300">
          Gestisci pubblicazioni
        </button>
        {config.system_settings && (
          <button className="px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-black">
            Impostazioni sistema
          </button>
        )}
      </div>
    </div>
  );

  const body = () => {
    switch (t) {
      case "note_only":
        return renderNoteOnly();
      case "duplicate_private":
        return renderDuplicatePrivate();
      case "create_edit":
        return renderCreateEdit();
      case "validate_reject":
        return renderValidateReject();
      case "all":
        return renderAll();
      default:
        return (
          <p className="text-sm text-gray-600">
            Configurazione di creazione non riconosciuta.
          </p>
        );
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-white shadow mb-4">
      <h2 className="font-bold text-lg mb-3">Creazione</h2>
      {body()}
    </div>
  );
}
