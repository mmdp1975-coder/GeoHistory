'use client';

/**
 * GeoHistory – Build Journey (UI) — FULL REPLACEMENT
 * Due modalità:
 * 1) From scratch (form guidato)
 * 2) From video URL (auto-build)
 *
 * Nessuna dipendenza extra. Tailwind per lo styling.
 */

import React, { useMemo, useState } from 'react';
import {
  buildJourneyFromScratch,
  buildJourneyFromVideo,
  type JourneyI18n,
  type MiniEvent,
  type MiniMedia,
  type BuildJourneyFromScratchPayload,
} from './actions';

// =========================== PAGE ============================

type Tab = 'scratch' | 'video';

export default function BuildJourneyPage() {
  const [tab, setTab] = useState<Tab>('scratch');

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">Build Journey</h1>
          <p className="text-sm md:text-base text-neutral-600">
            Crea un Journey (group_event) con eventi, traduzioni e media — oppure genera tutto partendo da un link video.
          </p>
        </header>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setTab('scratch')}
            className={`rounded-xl px-4 py-2 text-sm font-medium border ${tab === 'scratch' ? 'bg-white shadow' : 'bg-neutral-100 hover:bg-white'}`}
          >
            From scratch
          </button>
          <button
            onClick={() => setTab('video')}
            className={`rounded-xl px-4 py-2 text-sm font-medium border ${tab === 'video' ? 'bg-white shadow' : 'bg-neutral-100 hover:bg-white'}`}
          >
            From video URL
          </button>
        </div>

        {tab === 'scratch' ? <ScratchForm /> : <VideoForm />}
      </div>
    </div>
  );
}

// ====================== FROM SCRATCH FORM ======================

function ScratchForm() {
  // Core journey
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [status, setStatus] = useState('draft');
  const [isOfficial, setIsOfficial] = useState(false);
  const [ownerUserRef, setOwnerUserRef] = useState('');
  const [ownerProfileId, setOwnerProfileId] = useState('');
  const [colorHex, setColorHex] = useState('');
  const [iconName, setIconName] = useState('');

  // i18n
  const [i18n, setI18n] = useState<JourneyI18n[]>([{ lang: 'en', title: '' }]);

  // events
  const [events, setEvents] = useState<MiniEvent[]>([]);

  // journey-level media
  const [media, setMedia] = useState<MiniMedia[]>([]);

  // UX state
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return slug.trim() && title.trim();
  }, [slug, title]);

  async function onSubmit() {
    setBusy(true);
    setErr(null);
    setMsg(null);

    const payload: BuildJourneyFromScratchPayload = {
      core: {
        slug: slug.trim(),
        title: title.trim(),
        pitch: pitch || null,
        cover_url: coverUrl || null,
        description: description || null,
        visibility,
        status,
        is_official: isOfficial,
        owner_user_ref: ownerUserRef || null,
        owner_profile_id: ownerProfileId || null,
        color_hex: colorHex || null,
        icon_name: iconName || null,
      },
      i18n,
      events,
      media,
    };

    try {
      const res = await buildJourneyFromScratch(payload);
      setMsg(`✅ ${res.message} (id: ${res.group_event_id})`);
    } catch (e: any) {
      setErr(`❌ ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 md:p-6 shadow-sm">
      <Section title="1) Journey core">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Text label="Slug *" value={slug} onChange={setSlug} placeholder="my-journey-slug" />
          <Text label="Title *" value={title} onChange={setTitle} placeholder="Journey title" />
          <Select label="Visibility" value={visibility} onChange={setVisibility} options={['private','shared','public']} />
          <Select label="Status" value={status} onChange={setStatus} options={['draft','review','published','archived']} />
          <Checkbox label="Is official" checked={isOfficial} onChange={setIsOfficial} />
          <Text label="Owner user ref" value={ownerUserRef} onChange={setOwnerUserRef} />
          <Text label="Owner profile id (uuid)" value={ownerProfileId} onChange={setOwnerProfileId} />
          <Text label="Color HEX" value={colorHex} onChange={setColorHex} placeholder="#0b3b60" />
          <Text label="Icon name" value={iconName} onChange={setIconName} placeholder="History" className="md:col-span-2" />
          <Text label="Cover URL" value={coverUrl} onChange={setCoverUrl} className="md:col-span-3" />
          <Textarea label="Pitch" value={pitch} onChange={setPitch} className="md:col-span-3" />
          <Textarea label="Description" value={description} onChange={setDescription} className="md:col-span-3" />
        </div>
      </Section>

      <Section title="2) Translations (Journey)">
        {i18n.map((t, idx) => (
          <div key={idx} className="mb-3 rounded-xl border p-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Text label="Lang *" value={t.lang} onChange={(v)=>editI18n(setI18n, idx, { lang: v })} />
              <Text label="Title *" value={t.title} onChange={(v)=>editI18n(setI18n, idx, { title: v })} className="md:col-span-2" />
              <Text label="Short name" value={t.short_name ?? ''} onChange={(v)=>editI18n(setI18n, idx, { short_name: v })} />
              <Text label="Video URL" value={t.video_url ?? ''} onChange={(v)=>editI18n(setI18n, idx, { video_url: v })} />
              <Textarea label="Description" value={t.description ?? ''} onChange={(v)=>editI18n(setI18n, idx, { description: v })} className="md:col-span-3" />
            </div>
            <div className="mt-2">
              {i18n.length > 1 && (
                <button className="text-xs rounded-lg border px-2 py-1" onClick={()=>removeAt(setI18n, idx)}>Remove</button>
              )}
            </div>
          </div>
        ))}
        <button className="rounded-lg border px-3 py-1 text-sm" onClick={()=>setI18n([...i18n, { lang: 'it', title: '' }])}>+ Add language</button>
      </Section>

      <Section title="3) Events">
        <EventEditor events={events} setEvents={setEvents} />
      </Section>

      <Section title="4) Journey Media">
        <MediaEditor media={media} setMedia={setMedia} />
      </Section>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={!canSubmit || busy}
          className="rounded-xl bg-neutral-900 text-white px-4 py-2 text-sm disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save Journey'}
        </button>
        {msg && <span className="text-green-700 text-sm">{msg}</span>}
        {err && <span className="text-red-700 text-sm">{err}</span>}
      </div>
    </div>
  );
}

// ====================== FROM VIDEO FORM ======================

function VideoForm() {
  const [url, setUrl] = useState('');
  const [lang, setLang] = useState('en');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onBuild() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await buildJourneyFromVideo({ videoUrl: url.trim(), lang });
      setMsg(`✅ ${res.message} (id: ${res.group_event_id})`);
    } catch (e: any) {
      setErr(`❌ ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 md:p-6 shadow-sm">
      <Section title="Auto-build from video">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Text label="Video URL *" value={url} onChange={setUrl} placeholder="https://www.youtube.com/watch?v=..." className="md:col-span-2" />
          <Text label="Language" value={lang} onChange={setLang} />
        </div>
        <p className="mt-2 text-xs text-neutral-600">
          Verrà effettuato un oEmbed (YouTube/Vimeo), usati titolo/descrizione/thumbnail e creati eventi dai capitoli (timestamp) se presenti.
        </p>

        <div className="mt-4">
          <button
            onClick={onBuild}
            disabled={!url.trim() || busy}
            className="rounded-xl bg-neutral-900 text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? 'Building…' : 'Build Journey'}
          </button>
        </div>

        {msg && <p className="mt-3 text-green-700 text-sm">{msg}</p>}
        {err && <p className="mt-3 text-red-700 text-sm">{err}</p>}
      </Section>
    </div>
  );
}

// ========================= REUSABLE UI =========================

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">{props.title}</h2>
      {props.children}
    </section>
  );
}
function Text(props: { label: string; value: string; onChange: (v: string)=>void; placeholder?: string; className?: string }) {
  return (
    <label className={`block ${props.className ?? ''}`}>
      <span className="text-xs text-neutral-600">{props.label}</span>
      <input
        type="text"
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </label>
  );
}
function Textarea(props: { label: string; value: string; onChange: (v: string)=>void; className?: string }) {
  return (
    <label className={`block ${props.className ?? ''}`}>
      <span className="text-xs text-neutral-600">{props.label}</span>
      <textarea
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        rows={4}
      />
    </label>
  );
}
function NumberInput(props: { label: string; value: number|''; onChange: (v: number|'')=>void; className?: string }) {
  return (
    <label className={`block ${props.className ?? ''}`}>
      <span className="text-xs text-neutral-600">{props.label}</span>
      <input
        type="number"
        value={props.value}
        onChange={e => props.onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </label>
  );
}
function Select(props: { label: string; value: string; onChange: (v: string)=>void; options: string[]; className?: string }) {
  return (
    <label className={`block ${props.className ?? ''}`}>
      <span className="text-xs text-neutral-600">{props.label}</span>
      <select
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
      >
        {props.options.map(o => <option key={o} value={o}>{o || '(empty)'}</option>)}
      </select>
    </label>
  );
}
function Checkbox(props: { label: string; checked: boolean; onChange: (v: boolean)=>void }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={props.checked} onChange={e => props.onChange(e.target.checked)} />
      <span className="text-sm">{props.label}</span>
    </label>
  );
}
function removeAt<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, idx: number) {
  setter(prev => prev.filter((_, i) => i !== idx));
}
function editI18n(setter: React.Dispatch<React.SetStateAction<JourneyI18n[]>>, idx: number, patch: Partial<JourneyI18n>) {
  setter(prev => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
}

// --------------------- Events Editor ---------------------

function EventEditor(props: { events: MiniEvent[]; setEvents: (v: MiniEvent[]) => void }) {
  const { events, setEvents } = props;

  function addEvent() {
    setEvents([
      ...events,
      {
        year_from: new Date().getFullYear(),
        year_to: new Date().getFullYear(),
        era: 'AD',
        translations: [{ lang: 'en', title: '' }],
      } as MiniEvent,
    ]);
  }
  function edit(idx: number, patch: Partial<MiniEvent>) {
    setEvents(events.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function remove(idx: number) {
    setEvents(events.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {events.map((e, idx) => (
        <div key={idx} className="mb-4 rounded-xl border p-3 bg-neutral-50/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <NumberInput label="Year from *" value={(e.year_from as any) ?? ''} onChange={(v)=>edit(idx,{ year_from: (v === '' ? ('' as any) : Number(v)) as any })} />
            <NumberInput label="Year to" value={(e.year_to as any) ?? ''} onChange={(v)=>edit(idx,{ year_to: (v === '' ? null : Number(v)) as any })} />
            <Text label="Era" value={e.era ?? ''} onChange={(v)=>edit(idx,{ era: v || null })} />

            <Text label="Continent" value={e.continent ?? ''} onChange={(v)=>edit(idx,{ continent: v || null })} />
            <Text label="Country" value={e.country ?? ''} onChange={(v)=>edit(idx,{ country: v || null })} />
            <Text label="Location" value={e.location ?? ''} onChange={(v)=>edit(idx,{ location: v || null })} />

            <NumberInput label="Latitude" value={(e.latitude as any) ?? ''} onChange={(v)=>edit(idx,{ latitude: (v === '' ? null : Number(v)) as any })} />
            <NumberInput label="Longitude" value={(e.longitude as any) ?? ''} onChange={(v)=>edit(idx,{ longitude: (v === '' ? null : Number(v)) as any })} />

            <Text label="Exact date (YYYY-MM-DD)" value={e.exact_date ?? ''} onChange={(v)=>edit(idx,{ exact_date: v || null })} />
            <Text label="Image URL" value={e.image_url ?? ''} onChange={(v)=>edit(idx,{ image_url: v || null })} className="md:col-span-2" />
          </div>

          <div className="mt-3">
            <h4 className="text-sm font-medium mb-2">Translations (Event)</h4>
            <EventTranslationsEditor
              value={e.translations}
              onChange={(value)=>edit(idx, { translations: value })}
            />
          </div>

          <div className="mt-3">
            <MediaEditor title="Event media" media={e.media ?? []} setMedia={(m)=>edit(idx, { media: m })} />
          </div>

          <div className="mt-3 flex gap-2">
            <button className="text-xs rounded-lg border px-2 py-1" onClick={()=>remove(idx)}>Remove event</button>
          </div>
        </div>
      ))}

      <button className="rounded-lg border px-3 py-1 text-sm" onClick={addEvent}>+ Add event</button>
    </div>
  );
}

function EventTranslationsEditor(props: {
  value: MiniEvent['translations'];
  onChange: (v: MiniEvent['translations']) => void;
}) {
  const value = props.value ?? [{ lang: 'en', title: '' }];

  function add() {
    props.onChange([ ...(value || []), { lang: 'en', title: '' } ]);
  }
  function edit(i: number, patch: Partial<MiniEvent['translations'][number]>) {
    props.onChange(value.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function remove(i: number) {
    props.onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      {value.map((t, i) => (
        <div key={i} className="mb-2 rounded-lg border p-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Text label="Lang *" value={t.lang} onChange={(v)=>edit(i, { lang: v })} />
            <Text label="Title *" value={t.title} onChange={(v)=>edit(i, { title: v })} className="md:col-span-2" />
            <Textarea label="Description" value={t.description ?? ''} onChange={(v)=>edit(i, { description: v })} className="md:col-span-3" />
            <Text label="Short description" value={t.description_short ?? ''} onChange={(v)=>edit(i, { description_short: v })} />
            <Text label="Wikipedia URL" value={t.wikipedia_url ?? ''} onChange={(v)=>edit(i, { wikipedia_url: v })} />
            <Text label="Video URL" value={t.video_url ?? ''} onChange={(v)=>edit(i, { video_url: v })} />
          </div>
          <div className="mt-2">
            {value.length > 1 && <button className="text-xs rounded-lg border px-2 py-1" onClick={()=>remove(i)}>Remove</button>}
          </div>
        </div>
      ))}
      <button className="rounded-lg border px-3 py-1 text-sm" onClick={add}>+ Add translation</button>
    </div>
  );
}

// --------------------- Media Editor ---------------------

function MediaEditor(props: { media: MiniMedia[]; setMedia: (v: MiniMedia[]) => void; title?: string }) {
  const media = props.media ?? [];
  const setMedia = props.setMedia;

  function add() {
    setMedia([ ...(media || []), { url: '', role: '', media_type: '' } as any ]);
  }
  function edit(idx: number, patch: Partial<MiniMedia>) {
    setMedia(media.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  function remove(idx: number) {
    setMedia(media.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {props.title && <h3 className="mb-2 text-sm font-medium">{props.title}</h3>}
      {(media || []).map((m, idx) => (
        <div key={idx} className="mb-3 rounded-lg border p-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Text label="URL *" value={m.url} onChange={(v)=>edit(idx, { url: v })} className="md:col-span-3" />
            <Text label="Media type" value={m.media_type ?? ''} onChange={(v)=>edit(idx, { media_type: v || null })} />
            <Text label="Role" value={m.role ?? ''} onChange={(v)=>edit(idx, { role: v || null })} />
            <Text label="Title" value={m.title ?? ''} onChange={(v)=>edit(idx, { title: v || null })} className="md:col-span-2" />
            <Textarea label="Caption" value={m.caption ?? ''} onChange={(v)=>edit(idx, { caption: v || null })} className="md:col-span-3" />
            <Text label="Alt text" value={m.alt_text ?? ''} onChange={(v)=>edit(idx, { alt_text: v || null })} />
            <Text label="Preview URL" value={m.preview_url ?? ''} onChange={(v)=>edit(idx, { preview_url: v || null })} />
            <Text label="Credits" value={m.credits ?? ''} onChange={(v)=>edit(idx, { credits: v || null })} />
            <NumberInput label="Sort order" value={(m.sort_order as any) ?? ''} onChange={(v)=>edit(idx, { sort_order: (v === '' ? null : Number(v)) as any })} />
          </div>
          <div className="mt-2">
            <button className="text-xs rounded-lg border px-2 py-1" onClick={()=>remove(idx)}>Remove media</button>
          </div>
        </div>
      ))}
      <button className="rounded-lg border px-3 py-1 text-sm" onClick={add}>+ Add media</button>
    </div>
  );
}








