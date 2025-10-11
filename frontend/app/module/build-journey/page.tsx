// frontend/app/module/build-journey/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { analyzeVideoDeep, saveJourney, type SaveJourneyPayload } from "./actions";

type Visibility = "private" | "public";

export default function BuildJourneyPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<"scratch" | "video" | null>(null);

  // STEP 1 — group_event
  const [ge, setGe] = useState({
    title: "",
    cover_url: "",
    visibility: "private" as Visibility,
    status: "draft" as "draft" | "published",
    pitch: "",
    description: "",
    language: "it",
  });
  const [geT, setGeT] = useState({
    lang: "it",
    title: "",
    short_name: "",
    description: "",
    video_url: "",
  });

  // EVENTS
  type Ev = SaveJourneyPayload["events"][number];
  const [events, setEvents] = useState<Ev[]>([seedEvent("it"), seedEvent("it")]);

  function seedEvent(lang: string): Ev {
    return {
      era: "AD",
      year_from: null,
      year_to: null,
      exact_date: null,
      continent: null,
      country: null,
      location: null,
      latitude: null,
      longitude: null,
      geom: null,
      source_event_id: null,
      image_url: null,
      images_json: null,
      translations: [{ lang, title: "", description: "", description_short: "", wikipedia_url: "", video_url: "" }],
      type_codes: [],
      media: [],
      added_by_user_ref: null,
    };
  }

  // VIDEO
  const [videoUrl, setVideoUrl] = useState("");
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState<any | null>(null);

  const canContinueFromStep1 = useMemo(
    () => ge.title.trim().length >= 3 && /^https?:\/\//i.test(ge.cover_url || "") &&
      (!!ge.visibility && (ge.visibility === "private" || (ge.visibility === "public" && ge.status))),
    [ge]
  );

  // ——— ANALYZE: ora si abilita se il campo NON è vuoto, la validazione dominio è interna ———
  async function onAnalyze() {
    setAnalyzeError(null);
    const raw = videoUrl.trim();
    if (!raw) {
      setAnalyzeError("Inserisci un URL del video.");
      return;
    }

    // Normalizzazione veloce: se manca il protocollo e inizia con youtube/vimeo/youtu.be, aggiungi https://
    let normalized = raw;
    if (!/^https?:\/\//i.test(normalized) && /(youtube\.com|youtu\.be|vimeo\.com)/i.test(normalized)) {
      normalized = "https://" + normalized;
      setVideoUrl(normalized);
    }

    // Validazione dominio supportato
    const supported = /(youtu\.be|youtube\.com|vimeo\.com)/i.test(normalized);
    if (!supported) {
      setAnalyzeError("Sono supportati solo link YouTube o Vimeo.");
      return;
    }

    setAnalyzeLoading(true);
    try {
      const res = await analyzeVideoDeep({ videoUrl: normalized, lang: ge.language });
      setAnalyzed(res);
      // Prefill GE se vuoto
      setGe((g) => ({
        ...g,
        title: g.title || res.prefill.group_event.title,
        cover_url: g.cover_url || res.prefill.group_event.cover_url,
        description: g.description || res.prefill.group_event.description,
      }));
      // Prefill eventi strutturati (date/luoghi)
      if (res.prefill.events?.length) {
        setEvents(res.prefill.events);
      }
    } catch (e: any) {
      setAnalyzeError(e.message || "Analyze failed");
    } finally {
      setAnalyzeLoading(false);
    }
  }

  // SAVE
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<{ id: string } | null>(null);

  function patchEvent(index: number, patch: Partial<Ev>) {
    setEvents((p) => p.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function addEvent() {
    setEvents((p) => [...p, seedEvent(ge.language)]);
  }
  function removeEvent(index: number) {
    setEvents((p) => p.filter((_, i) => i !== index));
  }

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);

    if (events.length < 2) {
      setSaveError("Aggiungi almeno 2 eventi.");
      setSaving(false);
      return;
    }
    const invalid = events.find(
      (ev) => !ev.translations?.[0]?.title?.trim() || !ev.translations?.[0]?.description_short?.trim()
    );
    if (invalid) {
      setSaveError("Ogni evento deve avere Title e Short description (prima traduzione).");
      setSaving(false);
      return;
    }

    const payload: SaveJourneyPayload = {
      group_event: {
        title: ge.title,
        cover_url: ge.cover_url,
        visibility: ge.visibility,
        status: ge.status,
        pitch: ge.pitch || undefined,
        description: ge.description || undefined,
        language: ge.language || "it",
      },
      group_event_translation: geT.lang
        ? {
            lang: geT.lang,
            title: geT.title || undefined,
            short_name: geT.short_name || undefined,
            description: geT.description || undefined,
            video_url: geT.video_url || undefined,
          }
        : null,
      video_media_url: analyzed?.video?.url || null,
      events,
    };

    try {
      const res = await saveJourney(payload);
      setSaveOk({ id: res.group_event_id });
    } catch (e: any) {
      setSaveError(e.message || "Errore di salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 px-6 py-8">
      <div className="mx-auto w-full max-w-6xl bg-white rounded-2xl shadow p-8">
        {/* Header + progress */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">Build your Journey</h1>
          <div className="text-sm text-neutral-500">Step {step} of 3</div>
        </div>
        <div className="h-1 w-full bg-neutral-200 rounded-full mb-6">
          <div className="h-1 bg-sky-600 rounded-full transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT — Basics */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 uppercase mb-3">Journey basics</h3>
              <div className="space-y-4">
                <Input label="Journey name *" value={ge.title} onChange={(v)=>setGe({...ge,title:v})} placeholder="Es. Age of Exploration" />

                <div>
                  <label className="block text-sm font-medium mb-1">Visibility *</label>
                  <div className="flex gap-2">
                    <button className={`rounded-full border px-3 py-1 text-sm ${ge.visibility==='private'?'bg-neutral-900 text-white border-neutral-900':'bg-white'}`} onClick={()=>setGe({...ge,visibility:'private'})}>Private</button>
                    <button className={`rounded-full border px-3 py-1 text-sm ${ge.visibility==='public'?'bg-neutral-900 text-white border-neutral-900':'bg-white'}`} onClick={()=>setGe({...ge,visibility:'public'})}>Public</button>
                    {ge.visibility==='public' && (
                      <select className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" value={ge.status} onChange={(e)=>setGe({...ge,status:e.target.value as any})}>
                        <option value="draft">draft</option>
                        <option value="published">published</option>
                      </select>
                    )}
                  </div>
                </div>

                <Input label="Pitch" value={ge.pitch} onChange={(v)=>setGe({...ge,pitch:v})} placeholder="One-line hook" />
                <Textarea label="Description" value={ge.description} onChange={(v)=>setGe({...ge,description:v})} placeholder="Add a short description…" />

                {/* group_event_translations */}
                <details className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
                  <summary className="cursor-pointer text-sm font-medium">Translations (group_event_translations)</summary>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Select label="Lang" value={geT.lang} onChange={(v)=>{ setGeT({...geT,lang:v}); setGe({...ge,language:v});}} options={[{value:"it",label:"it"},{value:"en",label:"en"}]} />
                    <Input label="Title" value={geT.title} onChange={(v)=>setGeT({...geT,title:v})} />
                    <Input label="Short name" value={geT.short_name} onChange={(v)=>setGeT({...geT,short_name:v})} />
                    <Input label="Video URL" value={geT.video_url} onChange={(v)=>setGeT({...geT,video_url:v})} />
                    <Textarea className="md:col-span-2" label="Description" value={geT.description} onChange={(v)=>setGeT({...geT,description:v})} />
                  </div>
                </details>

                <div className="flex justify-end pt-2">
                  <button className={`rounded-lg px-4 py-2 text-sm ${canContinueFromStep1? 'bg-neutral-900 text-white':'bg-neutral-200 text-neutral-500'}`} disabled={!canContinueFromStep1} onClick={()=>setStep(2)}>Continue →</button>
                </div>
              </div>
            </div>

            {/* RIGHT — Cover */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 uppercase mb-3">Cover image *</h3>
              <div className="space-y-3">
                <Input value={ge.cover_url} onChange={(v)=>setGe({...ge,cover_url:v})} placeholder="https://… (URL immagine)" />
                <div className="aspect-video w-full rounded-xl border border-dashed border-neutral-300 flex items-center justify-center overflow-hidden">
                  {/^https?:\/\//i.test(ge.cover_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ge.cover_url} alt="cover" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-neutral-400">Preview</span>
                  )}
                </div>
                <button type="button" className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs" onClick={()=>setGe({...ge,cover_url:"https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200"})}>Use demo</button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 uppercase mb-3">Choose how to build</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CardChoice title="From scratch" active={mode==='scratch'} onClick={()=>setMode('scratch')}>Crea gli eventi manualmente (minimo 2).</CardChoice>
              <CardChoice title="From video link" active={mode==='video'} onClick={()=>setMode('video')}>Analizza il video e precompila eventi (date/luoghi).</CardChoice>
            </div>
            <div className="mt-6 flex justify-between">
              <button className="text-sm text-neutral-700" onClick={()=>setStep(1)}>← Back</button>
              <button className={`rounded-lg px-4 py-2 text-sm ${mode? 'bg-neutral-900 text-white':'bg-neutral-200 text-neutral-500'}`} disabled={!mode} onClick={()=>setStep(3)}>Next →</button>
            </div>
          </div>
        )}

        {/* STEP 3A — SCRATCH */}
        {step === 3 && mode === "scratch" && (
          <div>
            <h3 className="text-lg font-medium mb-4">Step 3: From scratch</h3>
            <p className="text-sm text-neutral-600 mb-4">Compila almeno due eventi (Title + Short description).</p>

            <div className="mb-4 flex items-center gap-3">
              <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" onClick={addEvent}>+ Add event</button>
              <span className="text-sm text-neutral-500">Events: {events.length}</span>
            </div>

            <div className="space-y-4">
              {events.map((ev, idx) => {
                const tr = ev.translations[0];
                return (
                  <div key={idx} className="rounded-xl border border-neutral-200 p-4 bg-white">
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-semibold text-neutral-700">Event {idx + 1}</div>
                      <button className="text-sm text-red-600" onClick={()=>removeEvent(idx)}>Remove</button>
                    </div>

                    {/* translations (prima riga) */}
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Select label="Lang" value={tr.lang} onChange={(v)=>{
                        const c=[...events]; c[idx].translations[0].lang=v; setEvents(c);
                      }} options={[{value:"it",label:"it"},{value:"en",label:"en"}]} />
                      <Input label="Title *" value={tr.title} onChange={(v)=>{
                        const c=[...events]; c[idx].translations[0].title=v; setEvents(c);
                      }} />
                      <Textarea label="Description" value={tr.description} onChange={(v)=>{
                        const c=[...events]; c[idx].translations[0].description=v; setEvents(c);
                      }} />
                      <Input label="Short description *" value={tr.description_short} onChange={(v)=>{
                        const c=[...events]; c[idx].translations[0].description_short=v; setEvents(c);
                      }} />
                      <Input label="Wikipedia URL" value={tr.wikipedia_url||""} onChange={(v)=>{
                        const c=[...events]; c[idx].translations[0].wikipedia_url=v; setEvents(c);
                      }} />
                    </div>

                    {/* dettagli (date/luoghi) */}
                    <details className="mt-4 rounded-lg border border-neutral-200 p-3">
                      <summary className="text-sm font-medium cursor-pointer">Event details (date & place)</summary>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Select label="Era" value={ev.era || "AD"} onChange={(v)=>patchEvent(idx,{era: v as any})} options={[{value:"AD",label:"AD"},{value:"BC",label:"BC"}]} />
                        <Input label="Year from" value={ev.year_from?.toString() || ""} onChange={(v)=>patchEvent(idx,{year_from: v? Number(v): null})} />
                        <Input label="Year to" value={ev.year_to?.toString() || ""} onChange={(v)=>patchEvent(idx,{year_to: v? Number(v): null})} />
                        <Input label="Exact date (YYYY-MM-DD)" value={ev.exact_date || ""} onChange={(v)=>patchEvent(idx,{exact_date: v || null})} />
                        <Input label="Continent" value={ev.continent || ""} onChange={(v)=>patchEvent(idx,{continent: v || null})} />
                        <Input label="Country" value={ev.country || ""} onChange={(v)=>patchEvent(idx,{country: v || null})} />
                        <Input className="md:col-span-2" label="Location" value={ev.location || ""} onChange={(v)=>patchEvent(idx,{location: v || null})} />
                        <Input label="Latitude" value={ev.latitude?.toString() || ""} onChange={(v)=>patchEvent(idx,{latitude: v? Number(v): null})} />
                        <Input label="Longitude" value={ev.longitude?.toString() || ""} onChange={(v)=>patchEvent(idx,{longitude: v? Number(v): null})} />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button className="text-sm text-neutral-700" onClick={()=>setStep(2)}>← Back</button>
              <button disabled={saving} className="rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm" onClick={onSave}>
                {saving ? "Saving…" : "Save Journey"}
              </button>
            </div>

            {/* esito save */}
            {saveError && <p className="mt-3 text-sm text-red-600">{saveError}</p>}
            {saveOk && <p className="mt-3 text-sm text-green-700">✅ Creato! ID: {saveOk.id}</p>}
          </div>
        )}

        {/* STEP 3B — VIDEO */}
        {step === 3 && mode === "video" && (
          <div>
            <h3 className="text-lg font-medium mb-4">Step 3: From video link</h3>
            <p className="text-sm text-neutral-600 mb-4">Analizza il video: estrazione automatica di eventi con date/luoghi.</p>

            <div className="rounded-xl border border-neutral-200 p-4 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                <div className="md:col-span-2">
                  <Input label="Video URL" value={videoUrl} onChange={setVideoUrl} placeholder="https://www.youtube.com/watch?v=..." />
                </div>
                <div className="flex gap-2 mt-6 md:mt-0">
                  <button
                    // ✅ ora basta che il campo NON sia vuoto
                    disabled={analyzeLoading || !videoUrl.trim()}
                    className={`rounded-lg px-4 py-2 text-sm ${videoUrl.trim()? 'bg-neutral-900 text-white':'bg-neutral-200 text-neutral-500'}`}
                    onClick={onAnalyze}
                  >
                    {analyzeLoading ? "Analyzing…" : "Analyze video"}
                  </button>
                  <button
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs"
                    onClick={()=>setVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}
                  >
                    Use demo
                  </button>
                </div>
              </div>

              {analyzeError && <p className="mt-2 text-sm text-red-600">{analyzeError}</p>}

              {analyzed && (
                <>
                  <div className="mt-4 text-sm">
                    <div className="font-medium">Title:</div>
                    <div className="text-neutral-700">{analyzed.video?.title}</div>
                  </div>
                  <div className="mt-2 text-sm">
                    <div className="font-medium">Provider:</div>
                    <div className="text-neutral-700">{analyzed.provider}</div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {analyzed.prefill?.events?.map((e: any, i: number) => (
                      <div key={i} className="rounded-lg border border-neutral-200 p-3 text-left">
                        <div className="text-xs text-neutral-500">Event {i + 1}</div>
                        <div className="text-sm font-medium">{e.translations?.[0]?.title}</div>
                        <div className="text-xs text-neutral-600 mt-1">
                          {e.exact_date || `${e.era ?? "AD"} ${e.year_from ?? ""}${e.year_to ? "–" + e.year_to : ""}`} · {e.country || e.location || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex justify-between">
              <button className="text-sm text-neutral-700" onClick={()=>setStep(2)}>← Back</button>
              <button
                className={`rounded-lg px-4 py-2 text-sm ${analyzed?.prefill?.events?.length? 'bg-neutral-900 text-white': 'bg-neutral-200 text-neutral-500'}`}
                disabled={!analyzed?.prefill?.events?.length}
                onClick={()=>{
                  setEvents(analyzed.prefill.events);
                  setMode("scratch");
                }}
              >
                Use to prefill →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ——— UI atoms ——— */
function CardChoice({ title, active, onClick, children }: { title: string; active?: boolean; onClick?: ()=>void; children?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-6 cursor-pointer ${active ? 'border-sky-500 ring-2 ring-sky-200' : 'border-neutral-200 bg-white'}`} onClick={onClick}>
      <h4 className="text-lg font-medium mb-2">{title}</h4>
      <p className="text-sm text-neutral-600 mb-0">{children}</p>
    </div>
  );
}
function Input({ label, value, onChange, placeholder, className }: { label?: string; value?: string; onChange?: (v:string)=>void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <input type="text" className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" value={value||""} placeholder={placeholder} onChange={(e)=>onChange?.(e.target.value)} />
    </div>
  );
}
function Textarea({ label, value, onChange, placeholder, className }: { label?: string; value?: string; onChange?: (v:string)=>void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <textarea className="w-full min-h-[96px] border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" value={value||""} placeholder={placeholder} onChange={(e)=>onChange?.(e.target.value)} />
    </div>
  );
}
function Select({ label, value, onChange, options, className }: { label?: string; value?: string; onChange?: (v:string)=>void; options: {value:string;label:string}[]; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" value={value} onChange={(e)=>onChange?.(e.target.value)}>
        {options.map((o)=> <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
