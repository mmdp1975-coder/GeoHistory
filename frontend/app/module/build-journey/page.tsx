"use client";

import { useMemo, useState, useTransition } from "react";
import { createJourneyWithEvents } from "./actions";

/** ===== Tipi UI ===== */
type Era = "AD" | "BC";

type EventRow = {
  id: string;
  // campi compatibili con events_list
  year_from?: number | "";
  year_to?: number | "";
  exact_date?: string;
  era: Era;
  continent?: string | null;
  country?: string | null;
  location?: string | null;
  lat?: number | "";
  lon?: number | "";
  // campi solo UI / event_translations
  title?: string;
  description?: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** ===== Pagina ===== */
export default function BuildJourneyPage() {
  const [tab, setTab] = useState<"manual" | "import">("import");

  /** ===== Stato Journey (manual) ===== */
  const [title, setTitle] = useState("");
  const [slugManual, setSlugManual] = useState("");
  const [slugAuto, setSlugAuto] = useState(true);
  const computedSlug = useMemo(() => {
    if (!slugAuto) return slugManual;
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);
  }, [title, slugAuto, slugManual]);

  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED" | "PUBLIC">("PRIVATE");
  const [status, setStatus] = useState<"DRAFT" | "REVIEW" | "PUBLISHED">("DRAFT");
  const [shortDesc, setShortDesc] = useState("");
  const [longDesc, setLongDesc] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [tags, setTags] = useState("");

  const [yearFromJ, setYearFromJ] = useState<number | "">("");
  const [yearToJ, setYearToJ] = useState<number | "">("");
  const [eraJ, setEraJ] = useState<Era>("AD");
  const [journeyPlace, setJourneyPlace] = useState("");
  const [journeyLat, setJourneyLat] = useState<number | "">("");
  const [journeyLon, setJourneyLon] = useState<number | "">("");

  const [events, setEvents] = useState<EventRow[]>([
    { id: uid(), era: "AD", year_from: "", year_to: "", location: "", lat: "", lon: "" },
  ]);

  const derivedPeriod = useMemo(() => {
    const starts = events
      .filter((e) => e.year_from !== "" && typeof e.year_from === "number")
      .map((e) => e.year_from as number);
    if (!starts.length) return null;
    const min = Math.min(...starts);
    const ends = events
      .map((e) => (typeof e.year_to === "number" ? e.year_to : (typeof e.year_from === "number" ? e.year_from : undefined)))
      .filter((x): x is number => typeof x === "number");
    const max = ends.length ? Math.max(...ends) : min;
    return { min, max };
  }, [events]);

  const canSaveDraft =
    title.trim().length > 0 &&
    computedSlug.trim().length > 0 &&
    events.some((e) => (e.year_from !== "" || e.year_to !== "" || (e.location ?? "").trim().length > 0));

  /** ===== Stato Import (AI) ===== */
  const [videoUrl, setVideoUrl] = useState("");
  const [importStage, setImportStage] = useState<"idle" | "fetching" | "review" | "error">("idle");
  const [debugMsg, setDebugMsg] = useState<string>("");
  const [propJourneyTitle, setPropJourneyTitle] = useState<string>("");
  const [propJourneyDesc, setPropJourneyDesc] = useState<string>("");
  const [propCover, setPropCover] = useState<string>("");
  const [propEvents, setPropEvents] = useState<EventRow[]>([]);

  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  /** ===== Helpers eventi (manual) ===== */
  function addEventRow() {
    setEvents((prev) => [...prev, { id: uid(), era: "AD", year_from: "", year_to: "", location: "", lat: "", lon: "" }]);
  }
  function removeEventRow(id: string) {
    setEvents((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.id !== id)));
  }
  function updateEvent<T extends keyof EventRow>(id: string, key: T, value: EventRow[T]) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, [key]: value } : e)));
  }

  /** ===== CREATE Journey (manual) ===== */
  async function onCreateJourneyManual() {
    const payload = {
      title: title.trim(),
      slug: computedSlug.trim(),
      pitch: shortDesc || null,
      cover_url: coverUrl || null,
      description: longDesc || null,
      visibility,
      status,
      year_from: typeof yearFromJ === "number" ? yearFromJ : null,
      year_to: typeof yearToJ === "number" ? yearToJ : null,
      era: eraJ,
      journey_location: journeyPlace || null,
      journey_latitude: typeof journeyLat === "number" ? journeyLat : null,
      journey_longitude: typeof journeyLon === "number" ? journeyLon : null,
      events: events.map((e) => ({
        year_from: typeof e.year_from === "number" ? e.year_from : null,
        year_to: typeof e.year_to === "number" ? e.year_to : null,
        exact_date: e.exact_date || null,
        era: e.era,
        continent: e.continent ?? null,
        country: (e.country || "") || null,
        location: (e.location || "") || null,
        latitude: typeof e.lat === "number" ? e.lat : null,
        longitude: typeof e.lon === "number" ? e.lon : null,
        // manual: opzionalmente puoi abilitare anche titolo/descrizione
        title_text: (e.title || "").trim() || null,
        description_text: (e.description || "").trim() || null,
      })),
    } as const;

    setToast(null);
    startTransition(async () => {
      const res = await createJourneyWithEvents(payload as any);
      if (!res || !("ok" in res)) { setToast("Errore imprevisto nella creazione."); return; }
      if (!res.ok) { setToast(res.error || "Errore nella creazione."); return; }
      setToast("Journey creato con successo. ID: " + res.group_event_id);
    });
  }

  /** ===== IMPORT: chiama l’API di ingestione ===== */
  async function runIngest() {
    if (!videoUrl.trim()) { alert("Inserisci un URL video valido"); return; }
    setImportStage("fetching");
    setDebugMsg("Analisi (chunking transcript + AI + geocoding)…");
    setPropJourneyTitle(""); setPropJourneyDesc(""); setPropCover(""); setPropEvents([]);

    try {
      const res = await fetch("/api/ingest/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl.trim() })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Errore ingest");
      const p = data.proposal;
      setPropJourneyTitle(p?.journey?.title || "Journey importato");
      setPropJourneyDesc(p?.journey?.description || "");
      setPropCover(p?.journey?.cover || "");
      setPropEvents(
        (p?.events || []).map((e: any) => ({
          id: uid(),
          era: (e.era === "BC" ? "BC" : "AD"),
          year_from: e.year_from ?? "",
          year_to: e.year_to ?? "",
          location: e.location ?? "",
          country: e.country ?? "",
          continent: e.continent ?? null,
          lat: typeof e.latitude === "number" ? e.latitude : "",
          lon: typeof e.longitude === "number" ? e.longitude : "",
          title: e.title ?? "",
          description: e.description ?? ""
        }))
      );
      setImportStage("review");
      setDebugMsg("Review pronta");
    } catch (err: any) {
      setImportStage("error");
      setDebugMsg("Errore: " + (err?.message || "ingest fallita"));
    }
  }

  /** ===== IMPORT: salva bozza (DB) ===== */
  async function importAsDraftFromReview() {
    if (!propJourneyTitle || propEvents.length === 0) {
      alert("Nessun dato da importare.");
      return;
    }
    const slug = propJourneyTitle
      .toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);

    const payload = {
      title: propJourneyTitle,
      slug,
      pitch: `Imported from: ${videoUrl}`,
      cover_url: propCover || null,
      description: propJourneyDesc || null,
      visibility: "PRIVATE",
      status: "DRAFT",
      year_from: null,
      year_to: null,
      era: "AD",
      journey_location: null,
      journey_latitude: null,
      journey_longitude: null,
      events: propEvents.map((e) => ({
        // events_list
        year_from: typeof e.year_from === "number" ? e.year_from : null,
        year_to: typeof e.year_to === "number" ? e.year_to : null,
        exact_date: null,
        era: e.era,
        continent: e.continent ?? null,
        country: (e.country || "").trim() || null,
        location: (e.location || "").trim() || null,
        latitude: typeof e.lat === "number" ? e.lat : null,
        longitude: typeof e.lon === "number" ? e.lon : null,
        // event_translations
        title_text: (e.title || "").trim() || null,
        description_text: (e.description || "").trim() || null,
      })),
    } as const;

    setToast(null);
    startTransition(async () => {
      const res = await createJourneyWithEvents(payload as any);
      if (!res || !("ok" in res)) { setToast("Errore imprevisto (import)."); return; }
      if (!res.ok) { setToast(res.error || "Errore nella creazione (import)."); return; }
      setToast("Journey importato come bozza. ID: " + res.group_event_id);
    });
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => history.back()} className="rounded-xl px-3 py-2 border hover:bg-gray-50" aria-label="Indietro">
            ← Indietro
          </button>
          <h1 className="text-2xl font-bold">Journey Builder</h1>
        </div>
        <div className="text-sm text-gray-500">Modulo: <code>/module/build-journey</code></div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="inline-flex rounded-2xl border overflow-hidden">
          <button className={`px-4 py-2 ${tab === "manual" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setTab("manual")}>
            Creazione manuale
          </button>
          <button className={`px-4 py-2 ${tab === "import" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setTab("import")}>
            Import da video (AI)
          </button>
        </div>
      </div>

      {/* ===== IMPORT TAB ===== */}
      {tab === "import" && (
        <div className="space-y-6">
          <section className="border rounded-2xl p-5">
            <h2 className="text-lg font-semibold mb-4">Import da video (AI)</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">URL video</label>
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2"
                  placeholder="https://www.youtube.com/watch?v=…"
                />
              </div>
              <div className="flex items-end gap-2">
                <button type="button" onClick={runIngest} className="rounded-xl px-4 py-2 bg-gray-900 text-white hover:opacity-90">
                  Analizza
                </button>
                <button type="button" onClick={() => { setImportStage("idle"); setPropEvents([]); setDebugMsg(""); }} className="rounded-xl px-4 py-2 border hover:bg-gray-50">
                  Reset
                </button>
              </div>
            </div>

            {/* Stato */}
            <div className="mt-4 text-sm text-gray-600">
              Stato: <b>{importStage}</b> {debugMsg ? `— ${debugMsg}` : ""}
            </div>

            {/* Review */}
            {importStage === "review" && (
              <div className="mt-6 rounded-2xl border p-4 bg-gray-50">
                <h3 className="font-semibold mb-3">Review proposta</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Titolo Journey</label>
                    <input value={propJourneyTitle} onChange={(e) => setPropJourneyTitle(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Cover (URL)</label>
                    <input value={propCover} onChange={(e) => setPropCover(e.target.value)} className="w-full rounded-xl border px-3 py-2" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm font-medium mb-1">Descrizione Journey</label>
                  <textarea value={propJourneyDesc} onChange={(e) => setPropJourneyDesc(e.target.value)} className="w-full rounded-xl border px-3 py-2 min-h-[72px]" />
                </div>

                <div className="overflow-auto mt-4">
                  <table className="min-w-full border rounded-xl overflow-hidden text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 border">Titolo</th>
                        <th className="px-3 py-2 border">Da</th>
                        <th className="px-3 py-2 border">A</th>
                        <th className="px-3 py-2 border">Era</th>
                        <th className="px-3 py-2 border">Luogo</th>
                        <th className="px-3 py-2 border">Paese</th>
                        <th className="px-3 py-2 border">Lat</th>
                        <th className="px-3 py-2 border">Lon</th>
                        <th className="px-3 py-2 border">Descrizione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propEvents.map((e, idx) => (
                        <tr key={e.id} className="align-top">
                          <td className="px-3 py-2 border min-w-[180px]">
                            <input value={e.title ?? ""} onChange={(ev) => setPropEvents((p) => p.map((x,i) => i===idx ? ({...x, title: ev.target.value}) : x))} className="w-full rounded-lg border px-2 py-1" />
                          </td>
                          <td className="px-3 py-2 border min-w-[90px]">
                            <input inputMode="numeric" value={e.year_from ?? ""} onChange={(ev) => setPropEvents((p)=>p.map((x,i)=> i===idx ? ({...x, year_from: ev.target.value===""? "" : Number(ev.target.value)}) : x))} className="w-full rounded-lg border px-2 py-1" />
                          </td>
                          <td className="px-3 py-2 border min-w-[90px]">
                            <input inputMode="numeric" value={e.year_to ?? ""} onChange={(ev) => setPropEvents((p)=>p.map((x,i)=> i===idx ? ({...x, year_to: ev.target.value===""? "" : Number(ev.target.value)}) : x))} className="w-full rounded-lg border px-2 py-1" />
                          </td>
                          <td className="px-3 py-2 border min-w-[80px]">
                            <select value={e.era} onChange={(ev) => setPropEvents((p)=>p.map((x,i)=> i===idx ? ({...x, era: ev.target.value as Era}) : x))} className="w-full rounded-lg border px-2 py-1">
                              <option value="AD">AD</option>
                              <option value="BC">BC</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 border min-w-[200px]">
                            <input value={e.location ?? ""} onChange={(ev) => setPropEvents((p)=>p.map((x,i)=> i===idx ? ({...x, location: ev.target.value}) : x))} className="w-full rounded-lg border px-2 py-1" />
                          </td>
                          <td className="px-3 py-2 border min-w-[140px]">
                            <input value={e.country ?? ""} onChange={(ev) => setPropEvents((p)=>p.map((x,i)=> i===idx ? ({...x, country: ev.target.value}) : x))} className="w-full rounded-lg border px-2 py-1" />
                          </td>
                          <td className="px-3 py-2 border min-w-[110px]">
                            <input inputMode="decimal" value={e.lat ?? ""} onChange={(ev) => setPropEvents((p)=>p.map((x,i)=> i===idx ? ({...x, lat: ev.target.value===""? "" : Number(ev.target.value)}) : x))} className="w-full rounded-lg border px-2 py-1" />
                          </td>
                          <td className="px-3 py-2 border min-w-[110px]">
                            <input inputMode="decimal" value={e.lon ?? ""} onChange={(ev) => setPropEvents((p)=>p.map((x,i)=> i===idx ? ({...x, lon: ev.target.value===""? "" : Number(ev.target.value)}) : x))} className="w-full rounded-lg border px-2 py-1" />
                          </td>
                          <td className="px-3 py-2 border min-w-[260px]">
                            <textarea value={e.description ?? ""} onChange={(ev) => setPropEvents((p)=>p.map((x,i)=> i===idx ? ({...x, description: ev.target.value}) : x))} className="w-full rounded-lg border px-2 py-1 min-h-[44px]" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-end gap-2 mt-4">
                  <button type="button" className="rounded-xl px-4 py-2 border hover:bg-gray-50" onClick={() => { setImportStage("idle"); setPropEvents([]); setDebugMsg(""); }}>
                    Annulla
                  </button>
                  <button type="button" className="rounded-xl px-4 py-2 bg-gray-900 text-white hover:opacity-90" onClick={importAsDraftFromReview} disabled={isPending}>
                    {isPending ? "Importo..." : "Importa come bozza"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {toast && (
            <div className="text-sm p-3 rounded-lg border bg-gray-50">
              {toast}
            </div>
          )}
        </div>
      )}

      {/* ===== MANUAL TAB ===== */}
      {tab === "manual" && (
        <div className="space-y-8">
          {/* Journey core */}
          <section className="border rounded-2xl p-5">
            <h2 className="text-lg font-semibold mb-4">Dettagli Journey</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Titolo *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="Es. Age of Exploration" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Slug *</label>
                <div className="flex items-center gap-2">
                  <input value={computedSlug} onChange={(e) => setSlugManual(e.target.value)} disabled={slugAuto} className="w-full rounded-xl border px-3 py-2" placeholder="auto-generato dal titolo" />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={slugAuto} onChange={(e) => setSlugAuto(e.target.checked)} /> Auto
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Visibilità *</label>
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)} className="w-full rounded-xl border px-3 py-2">
                  <option value="PRIVATE">Privato</option>
                  <option value="SHARED">Condiviso</option>
                  <option value="PUBLIC">Pubblico</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Stato *</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full rounded-xl border px-3 py-2">
                  <option value="DRAFT">Bozza</option>
                  <option value="REVIEW">Revisione</option>
                  <option value="PUBLISHED">Pubblicato</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Cover (URL)</label>
                <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="https://…" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Descrizione breve</label>
                <textarea value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} className="w-full rounded-xl border px-3 py-2 min-h-[72px]" placeholder="1-2 frasi" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrizione estesa</label>
                <textarea value={longDesc} onChange={(e) => setLongDesc(e.target.value)} className="w-full rounded-xl border px-3 py-2 min-h-[72px]" placeholder="Testo narrativo del Journey" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Tag (separati da virgola)</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="exploration, navigation, colonial" />
              </div>
            </div>
          </section>

          {/* Tempo & Geografia */}
          <section className="border rounded-2xl p-5">
            <h2 className="text-lg font-semibold mb-4">Tempo & Geografia</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Anno da</label>
                <input inputMode="numeric" value={yearFromJ} onChange={(e) => setYearFromJ(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-xl border px-3 py-2" placeholder="es. 1400" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Anno a</label>
                <input inputMode="numeric" value={yearToJ} onChange={(e) => setYearToJ(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-xl border px-3 py-2" placeholder="es. 1600" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Era</label>
                <select value={eraJ} onChange={(e) => setEraJ(e.target.value as Era)} className="w-full rounded-xl border px-3 py-2">
                  <option value="AD">AD</option>
                  <option value="BC">BC</option>
                </select>
              </div>
            </div>

            {derivedPeriod && (
              <p className="text-sm text-gray-500 mt-3">
                Periodo derivato dagli eventi: <strong>{derivedPeriod.min}</strong> → <strong>{derivedPeriod.max}</strong>
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="md:col-span-3">
                <label className="block text-sm font-medium mb-1">Luogo principale del Journey</label>
                <input value={journeyPlace} onChange={(e) => setJourneyPlace(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="Es. Lisbon, Portugal" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Latitudine</label>
                <input inputMode="decimal" value={journeyLat} onChange={(e) => setJourneyLat(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-xl border px-3 py-2" placeholder="es. 38.7223" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Longitudine</label>
                <input inputMode="decimal" value={journeyLon} onChange={(e) => setJourneyLon(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-xl border px-3 py-2" placeholder="-9.1393" />
              </div>
            </div>
          </section>

          {/* EVENTS editor (manual) */}
          <section className="border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Eventi</h2>
              <button type="button" onClick={addEventRow} className="rounded-xl px-3 py-2 border hover:bg-gray-50">+ Aggiungi evento</button>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full border rounded-xl overflow-hidden">
                <thead className="bg-gray-50 text-sm">
                  <tr>
                    <th className="px-3 py-2 border">Titolo</th>
                    <th className="px-3 py-2 border">Da</th>
                    <th className="px-3 py-2 border">A</th>
                    <th className="px-3 py-2 border">Data esatta</th>
                    <th className="px-3 py-2 border">Era</th>
                    <th className="px-3 py-2 border">Continente</th>
                    <th className="px-3 py-2 border">Paese</th>
                    <th className="px-3 py-2 border">Luogo</th>
                    <th className="px-3 py-2 border">Lat</th>
                    <th className="px-3 py-2 border">Lon</th>
                    <th className="px-3 py-2 border">Descrizione</th>
                    <th className="px-3 py-2 border">Azioni</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {events.map((ev) => (
                    <tr key={ev.id} className="align-top">
                      <td className="px-3 py-2 border min-w-[180px]">
                        <input value={ev.title ?? ""} onChange={(e) => updateEvent(ev.id, "title", e.target.value)} className="w-full rounded-lg border px-2 py-1" placeholder="Titolo evento" />
                      </td>
                      <td className="px-3 py-2 border min-w-[90px]">
                        <input inputMode="numeric" value={ev.year_from ?? ""} onChange={(e) => updateEvent(ev.id, "year_from", e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg border px-2 py-1" placeholder="1492" />
                      </td>
                      <td className="px-3 py-2 border min-w-[90px]">
                        <input inputMode="numeric" value={ev.year_to ?? ""} onChange={(e) => updateEvent(ev.id, "year_to", e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg border px-2 py-1" placeholder="1493" />
                      </td>
                      <td className="px-3 py-2 border min-w-[130px]">
                        <input value={ev.exact_date ?? ""} onChange={(e) => updateEvent(ev.id, "exact_date", e.target.value)} className="w-full rounded-lg border px-2 py-1" placeholder="YYYY-MM-DD" />
                      </td>
                      <td className="px-3 py-2 border min-w-[80px]">
                        <select value={ev.era} onChange={(e) => updateEvent(ev.id, "era", e.target.value as Era)} className="w-full rounded-lg border px-2 py-1">
                          <option value="AD">AD</option>
                          <option value="BC">BC</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 border min-w-[130px]">
                        <input value={ev.continent ?? ""} onChange={(e) => updateEvent(ev.id, "continent", e.target.value)} className="w-full rounded-lg border px-2 py-1" placeholder="Europe" />
                      </td>
                      <td className="px-3 py-2 border min-w-[130px]">
                        <input value={ev.country ?? ""} onChange={(e) => updateEvent(ev.id, "country", e.target.value)} className="w-full rounded-lg border px-2 py-1" placeholder="Italy" />
                      </td>
                      <td className="px-3 py-2 border min-w-[200px]">
                        <input value={ev.location ?? ""} onChange={(e) => updateEvent(ev.id, "location", e.target.value)} className="w-full rounded-lg border px-2 py-1" placeholder="Genoa, Liguria" />
                      </td>
                      <td className="px-3 py-2 border min-w-[110px]">
                        <input inputMode="decimal" value={ev.lat ?? ""} onChange={(e) => updateEvent(ev.id, "lat", e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg border px-2 py-1" placeholder="44.4056" />
                      </td>
                      <td className="px-3 py-2 border min-w-[110px]">
                        <input inputMode="decimal" value={ev.lon ?? ""} onChange={(e) => updateEvent(ev.id, "lon", e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg border px-2 py-1" placeholder="8.9463" />
                      </td>
                      <td className="px-3 py-2 border min-w-[220px]">
                        <textarea value={ev.description ?? ""} onChange={(e) => updateEvent(ev.id, "description", e.target.value)} className="w-full rounded-lg border px-2 py-1 min-h-[44px]" placeholder="2–3 frasi" />
                      </td>
                      <td className="px-3 py-2 border">
                        <button type="button" onClick={() => removeEventRow(ev.id)} className="rounded-lg px-2 py-1 border hover:bg-gray-50" title="Rimuovi">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex flex-wrap gap-2 mt-3 text-sm">
                <button type="button" className="rounded-xl px-3 py-2 border hover:bg-gray-50"
                  onClick={() => setEvents((prev) => prev.map((e) => ({ ...e, era: "AD" })))}>
                  Imposta era = AD (tutti)
                </button>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={!canSaveDraft || isPending}
              className={`rounded-xl px-4 py-2 border ${canSaveDraft && !isPending ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"}`}
              onClick={onCreateJourneyManual}
              title={!canSaveDraft ? "Compila: Titolo, Slug e almeno un evento con dati minimi" : ""}
            >
              {isPending ? "Salvataggio..." : "Crea Journey"}
            </button>
          </div>

          {toast && (
            <div className="mt-3 text-sm p-3 rounded-lg border bg-gray-50">
              {toast}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
