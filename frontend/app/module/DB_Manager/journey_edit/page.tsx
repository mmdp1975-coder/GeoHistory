"use client";

/**
 * GeoHistory Journey — DB Manager
 * Path: app/module/DB_Manager/journey_edit/page.tsx
 *
 * Sidebar: elenco group_events
 * Destra: CRUD su:
 *  - group_events
 *  - group_event_translations
 *  - event_group_event
 *  - events_list
 *  - event_translations (per ciascun event)
 *  - event_type_map (per ciascun event, PK composta {event_id,type_code})
 *  - event_types (lookup)
 *
 * Supabase client (browser): "@/lib/supabaseBrowserClient" -> getBrowserSupabase()
 */

import React, { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabaseBrowserClient";
import {
  Loader2,
  RefreshCcw,
  Search,
  Plus,
  Save,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type UUID = string;
type Row = Record<string, any>;
const PAGE_SIZE = 20;

/* ------------------------ UTILS ------------------------ */
function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}
function toPrettyJSON(x: any) {
  try {
    return JSON.stringify(x ?? {}, null, 2);
  } catch {
    return "{}";
  }
}
function tryParseJSON(s: string): any | Error {
  try {
    return JSON.parse(s);
  } catch (e: any) {
    return new Error(e?.message || "Invalid JSON");
  }
}

/* ------------------------ GENERIC UI ------------------------ */
function Section({
  title,
  right,
  defaultOpen = true,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <button
          className="flex items-center gap-2 text-left font-semibold text-neutral-800"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {title}
        </button>
        <div>{right}</div>
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
        disabled
          ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
          : "border-neutral-200 bg-white hover:bg-neutral-50"
      )}
    >
      {children}
    </button>
  );
}

function JsonEditor({
  initial,
  onSave,
  onCancel,
  disabled,
  label,
  pkHint,
}: {
  initial?: Row;
  onSave: (payload: Row) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
  label?: string;
  pkHint?: string;
}) {
  const [text, setText] = useState(toPrettyJSON(initial ?? {}));
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setErr(null);
    const parsed = tryParseJSON(text);
    if (parsed instanceof Error) {
      setErr(parsed.message);
      return;
    }
    await onSave(parsed);
  }

  return (
    <div className="space-y-2">
      {label && <div className="text-sm font-medium text-neutral-700">{label}</div>}
      {pkHint && <div className="text-xs text-neutral-500">{pkHint}</div>}
      <textarea
        className="w-full resize-y rounded-md border border-neutral-300 bg-white p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-600"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        disabled={disabled}
      />
      {err && <div className="text-sm text-red-600">JSON error: {err}</div>}
      <div className="flex gap-2">
        <ToolbarButton onClick={onCancel} disabled={disabled}>
          Cancel
        </ToolbarButton>
        <ToolbarButton onClick={handleSave} disabled={disabled}>
          <Save className="h-4 w-4" />
          Save
        </ToolbarButton>
      </div>
    </div>
  );
}

/* Tabella Key/Value per un singolo record */
function KV({ obj }: { obj: Row | null }) {
  if (!obj) return <div className="text-sm text-neutral-500">No data</div>;
  const entries = Object.entries(obj);
  if (entries.length === 0) return <div className="text-sm text-neutral-500">Empty</div>;

  return (
    <div className="overflow-auto rounded border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-3 py-2 font-semibold text-neutral-600">Field</th>
            <th className="px-3 py-2 font-semibold text-neutral-600">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-t">
              <td className="px-3 py-2 font-medium text-neutral-800">{k}</td>
              <td className="px-3 py-2">
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-neutral-800">
                  {toPrettyJSON(v)}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Tabella generica listabile */
function ListTable<T extends Row>({
  rows,
  columns,
  onEdit,
  onDelete,
  deleteTitle = "Delete",
  pkInfo,
}: {
  rows: T[];
  columns: Array<{ key: keyof T | string; label: string }>;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  deleteTitle?: string;
  pkInfo?: string;
}) {
  if (!rows || rows.length === 0) return <div className="text-sm text-neutral-500">No rows</div>;

  return (
    <div className="overflow-auto rounded border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-neutral-50">
          <tr>
            {columns.map((c) => (
              <th key={String(c.key)} className="px-3 py-2 font-semibold text-neutral-600">
                {c.label}
              </th>
            ))}
            {(onEdit || onDelete) && (
              <th className="px-3 py-2 font-semibold text-neutral-600">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={(r as any).id ?? idx} className="border-t">
              {columns.map((c) => (
                <td key={String(c.key)} className="px-3 py-2 align-top">
                  <div className="max-w-[420px] truncate" title={String((r as any)[c.key])}>
                    {typeof (r as any)[c.key] === "object" ? (
                      <span className="font-mono text-xs text-neutral-600">
                        {JSON.stringify((r as any)[c.key])}
                      </span>
                    ) : (
                      <span className="text-neutral-800">{String((r as any)[c.key] ?? "")}</span>
                    )}
                  </div>
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    {onEdit && (
                      <ToolbarButton onClick={() => onEdit(r)}>
                        <Save className="h-4 w-4" />
                        Edit
                      </ToolbarButton>
                    )}
                    {onDelete && (
                      <ToolbarButton onClick={() => onDelete(r)}>
                        <Trash2 className="h-4 w-4" />
                        {deleteTitle}
                      </ToolbarButton>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {pkInfo && <div className="px-3 py-2 text-xs text-neutral-500">{pkInfo}</div>}
    </div>
  );
}

/* ------------------------ SUPABASE HOOK ------------------------ */
function useSB() {
  return useMemo(() => getBrowserSupabase(), []);
}

/* ------------------------ TYPES & DATA HOOKS ------------------------ */
type GroupEvent = {
  id: UUID;
  code: string | null;
  slug: string | null;
  title: string | null;
  pitch: string | null;
  updated_at?: string | null;
};

function useGroupEvents() {
  const sb = useSB();
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<GroupEvent[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    try {
      const { count } = await sb.from("group_events").select("*", { count: "exact", head: true });
      setCount(count ?? null);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await sb
        .from("group_events")
        .select("id, code, slug, title, pitch, updated_at")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .range(from, to);
      if (error) throw error;

      setRows((data ?? []) as GroupEvent[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page]); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) =>
      [r.title, r.slug, r.code, r.pitch].some((v) => (v ?? "").toLowerCase().includes(s))
    );
  }, [rows, q]);

  return { rows: filtered, q, setQ, page, setPage, count, loading, reload: load };
}

type GroupEventTranslation = {
  id: UUID;
  group_event_id: UUID;
  lang: string | null;
  title: string | null;
  short_name: string | null;
  description: string | null;
  video_url: string | null;
};

type EventGroupEvent = {
  id: UUID;
  event_id: UUID;
  group_event_id: UUID;
  added_by_user_ref?: string | null;
  created_at?: string | null;
};

type EventList = {
  id: UUID;
  year_from?: number | null;
  year_to?: number | null;
  exact_date?: string | null;
  era?: string | null;
  country?: string | null;
  location?: string | null;
};

type EventTranslation = {
  id: UUID;
  event_id: UUID;
  lang: string | null;
  title?: string | null;
  description?: string | null;
  description_short?: string | null;
  wikipedia_url?: string | null;
  video_url?: string | null;
};

type EventTypeMap = {
  event_id: UUID;
  type_code: string;
  assigned_at?: string | null;
};

type EventType = {
  code: string;
  label_en?: string | null;
  label_it?: string | null;
  icon_name?: string | null;
  sort_order?: number | null;
};

function useJourneyData(groupEventId: UUID | null) {
  const sb = useSB();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [groupEvent, setGroupEvent] = useState<Row | null>(null);
  const [geTranslations, setGeTranslations] = useState<GroupEventTranslation[]>([]);
  const [links, setLinks] = useState<EventGroupEvent[]>([]);
  const [events, setEvents] = useState<EventList[]>([]);
  const [eventTranslations, setEventTranslations] = useState<Record<UUID, EventTranslation[]>>({});
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [eventTypeMap, setEventTypeMap] = useState<Record<UUID, EventTypeMap[]>>({});

  async function load() {
    if (!groupEventId) return;
    setLoading(true);
    setErr(null);
    try {
      const { data: ge, error: e1 } = await sb
        .from("group_events")
        .select("*")
        .eq("id", groupEventId)
        .maybeSingle();
      if (e1) throw e1;
      setGroupEvent(ge ?? null);

      const { data: gets, error: e2 } = await sb
        .from("group_event_translations")
        .select("*")
        .eq("group_event_id", groupEventId)
        .order("lang", { ascending: true });
      if (e2) throw e2;
      setGeTranslations((gets ?? []) as GroupEventTranslation[]);

      const { data: linksRaw, error: e3 } = await sb
        .from("event_group_event")
        .select("*")
        .eq("group_event_id", groupEventId)
        .order("created_at", { ascending: false });
      if (e3) throw e3;
      const linksArr = (linksRaw ?? []) as EventGroupEvent[];
      setLinks(linksArr);

      const eventIds = linksArr.map((l) => l.event_id).filter(Boolean) as UUID[];
      if (eventIds.length) {
        // ⬇️ Tolto "title" perché non è presente nella tua events_list
        const { data: evs, error: e4 } = await sb
          .from("events_list")
          .select("id, year_from, year_to, exact_date, era, country, location")
          .in("id", eventIds);
        if (e4) throw e4;
        setEvents((evs ?? []) as EventList[]);

        const { data: ets, error: e5 } = await sb
          .from("event_translations")
          .select("*")
          .in("event_id", eventIds);
        if (e5) throw e5;
        const etMap: Record<UUID, EventTranslation[]> = {};
        (ets ?? []).forEach((row: any) => {
          const eid = row.event_id as UUID;
          if (!etMap[eid]) etMap[eid] = [];
          etMap[eid].push(row);
        });
        setEventTranslations(etMap);

        const { data: etm, error: e6 } = await sb
          .from("event_type_map")
          .select("*")
          .in("event_id", eventIds);
        if (e6) throw e6;
        const tm: Record<UUID, EventTypeMap[]> = {};
        (etm ?? []).forEach((row: any) => {
          const eid = row.event_id as UUID;
          if (!tm[eid]) tm[eid] = [];
          tm[eid].push(row);
        });
        setEventTypeMap(tm);
      } else {
        setEvents([]);
        setEventTranslations({});
        setEventTypeMap({});
      }

      const { data: types, error: e7 } = await sb
        .from("event_types")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: true });
      if (e7) throw e7;
      setEventTypes((types ?? []) as EventType[]);
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [groupEventId]); // eslint-disable-line

  return {
    loading,
    err,
    reload: load,
    groupEvent,
    geTranslations,
    links,
    events,
    eventTranslations,
    eventTypes,
    eventTypeMap,
  };
}

/* ------------------------ CRUD HELPERS ------------------------ */
function useCRUD() {
  const sb = useSB();
  return {
    geUpdate: async (id: UUID, payload: Row) => {
      const { error } = await sb.from("group_events").update(payload).eq("id", id);
      if (error) throw error;
    },
    // group_event_translations
    getCreate: async (payload: Row) => {
      const { error } = await sb.from("group_event_translations").insert(payload);
      if (error) throw error;
    },
    getUpdate: async (id: UUID, payload: Row) => {
      const { error } = await sb.from("group_event_translations").update(payload).eq("id", id);
      if (error) throw error;
    },
    getDelete: async (id: UUID) => {
      const { error } = await sb.from("group_event_translations").delete().eq("id", id);
      if (error) throw error;
    },
    // event_group_event
    egeCreate: async (payload: Row) => {
      const { error } = await sb.from("event_group_event").insert(payload);
      if (error) throw error;
    },
    egeUpdate: async (id: UUID, payload: Row) => {
      const { error } = await sb.from("event_group_event").update(payload).eq("id", id);
      if (error) throw error;
    },
    egeDelete: async (id: UUID) => {
      const { error } = await sb.from("event_group_event").delete().eq("id", id);
      if (error) throw error;
    },
    // events_list
    evCreate: async (payload: Row) => {
      const { error } = await sb.from("events_list").insert(payload);
      if (error) throw error;
    },
    evUpdate: async (id: UUID, payload: Row) => {
      const { error } = await sb.from("events_list").update(payload).eq("id", id);
      if (error) throw error;
    },
    evDelete: async (id: UUID) => {
      const { error } = await sb.from("events_list").delete().eq("id", id);
      if (error) throw error;
    },
    // event_translations
    etCreate: async (payload: Row) => {
      const { error } = await sb.from("event_translations").insert(payload);
      if (error) throw error;
    },
    etUpdate: async (id: UUID, payload: Row) => {
      const { error } = await sb.from("event_translations").update(payload).eq("id", id);
      if (error) throw error;
    },
    etDelete: async (id: UUID) => {
      const { error } = await sb.from("event_translations").delete().eq("id", id);
      if (error) throw error;
    },
    // event_type_map (PK composta)
    etmCreate: async (payload: Row) => {
      const { error } = await sb.from("event_type_map").insert(payload);
      if (error) throw error;
    },
    etmUpdate: async (match: { event_id: UUID; type_code: string }, payload: Row) => {
      const { error } = await sb.from("event_type_map").update(payload).match(match);
      if (error) throw error;
    },
    etmDelete: async (match: { event_id: UUID; type_code: string }) => {
      const { error } = await sb.from("event_type_map").delete().match(match);
      if (error) throw error;
    },
    // event_types
    etypeCreate: async (payload: Row) => {
      const { error } = await sb.from("event_types").insert(payload);
      if (error) throw error;
    },
    etypeUpdate: async (code: string, payload: Row) => {
      const { error } = await sb.from("event_types").update(payload).eq("code", code);
      if (error) throw error;
    },
    etypeDelete: async (code: string) => {
      const { error } = await sb.from("event_types").delete().eq("code", code);
      if (error) throw error;
    },
  };
}

/* ------------------------ EDITORS STATE & COMPONENT ------------------------ */
type EditorsState = {
  getCreate?: Row | null;
  getEdit?: Row | null;
  egeCreate?: Row | null;
  egeEdit?: Row | null;
  evCreate?: Row | null;
  evEdit?: Row | null;
  etCreate?: Row | null;
  etEdit?: Row | null;
  etmCreate?: Row | null;
  etmEdit?: Row | null;
  etypeCreate?: Row | null;
  etypeEdit?: Row | null;
};

function Editors(props: {
  labelCreate: string;
  labelEdit: string;
  pkHint?: string;
  tempKeyCreate:
    | "getCreate"
    | "egeCreate"
    | "evCreate"
    | "etCreate"
    | "etmCreate"
    | "etypeCreate";
  tempKeyEdit:
    | "getEdit"
    | "egeEdit"
    | "evEdit"
    | "etEdit"
    | "etmEdit"
    | "etypeEdit";
  onCreate: (payload: Row) => Promise<void>;
  onEdit: (payload: Row) => Promise<void>;
  onCancel: () => void;
  tempEditors: EditorsState;
  setTempEditors: React.Dispatch<React.SetStateAction<EditorsState>>;
  busy: boolean;
  reload: () => Promise<void> | void;
}) {
  const { tempEditors, setTempEditors, busy } = props;
  const createVal = (tempEditors as any)[props.tempKeyCreate] as Row | null | undefined;
  const editVal = (tempEditors as any)[props.tempKeyEdit] as Row | null | undefined;

  if (!createVal && !editVal) return null;

  return (
    <div className="mt-3 grid gap-4 md:grid-cols-2">
      {createVal && (
        <JsonEditor
          label={props.labelCreate}
          pkHint={props.pkHint}
          initial={createVal}
          disabled={busy}
          onCancel={props.onCancel}
          onSave={async (payload) => {
            try {
              await props.onCreate(payload);
              await props.reload();
              setTempEditors((s) => ({ ...s, [props.tempKeyCreate]: null }));
            } catch (e: any) {
              alert(e?.message ?? "Create error");
            }
          }}
        />
      )}
      {editVal && (
        <JsonEditor
          label={props.labelEdit}
          pkHint={props.pkHint}
          initial={editVal}
          disabled={busy}
          onCancel={props.onCancel}
          onSave={async (payload) => {
            try {
              await props.onEdit(payload);
              await props.reload();
              setTempEditors((s) => ({ ...s, [props.tempKeyEdit]: null }));
            } catch (e: any) {
              alert(e?.message ?? "Update error");
            }
          }}
        />
      )}
    </div>
  );
}

/* ------------------------ MAIN PAGE ------------------------ */
export default function JourneyEditPage() {
  const { rows: sidebarRows, q, setQ, page, setPage, count, loading: loadingSidebar, reload: reloadSidebar } =
    useGroupEvents();

  const [selected, setSelected] = useState<UUID | null>(null);
  const data = useJourneyData(selected);
  const crud = useCRUD();

  const [busy, setBusy] = useState(false);
  const [showGEEditor, setShowGEEditor] = useState(false);
  const [tempEditors, setTempEditors] = useState<EditorsState>({});

  useEffect(() => {
    setShowGEEditor(false);
  }, [selected]);

  // helper: titolo evento dalle translations
  function getEventTitle(eventId: UUID): string {
    const list = data.eventTranslations[eventId] ?? [];
    const it = list.find((t) => t.lang === "it")?.title;
    return (it ?? list[0]?.title ?? "(no title)") as string;
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* SIDEBAR */}
      <aside className="sticky top-0 h-screen w-[360px] shrink-0 border-r bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-base font-semibold">Group Events</div>
          <ToolbarButton onClick={reloadSidebar} disabled={loadingSidebar}>
            <RefreshCcw className={cn("h-4 w-4", loadingSidebar && "animate-spin")} />
            Refresh
          </ToolbarButton>
        </div>

        <div className="p-3">
          <div className="relative">
            <input
              className="w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Search title/slug/code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-neutral-400" />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-2 text-xs text-neutral-600">
          <div>
            Page {page + 1}
            {typeof count === "number" ? ` of ${Math.max(1, Math.ceil(count / PAGE_SIZE))}` : ""}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded border px-2 py-1 disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loadingSidebar}
            >
              Prev
            </button>
            <button
              className="rounded border px-2 py-1 disabled:opacity-50"
              onClick={() => setPage((p) => p + 1)}
              disabled={loadingSidebar}
            >
              Next
            </button>
          </div>
        </div>

        <div className="h-[calc(100vh-158px)] overflow-auto px-2 pb-4">
          {loadingSidebar ? (
            <div className="flex items-center justify-center py-12 text-neutral-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : sidebarRows.length === 0 ? (
            <div className="px-2 text-sm text-neutral-500">No group events</div>
          ) : (
            <ul className="space-y-2">
              {sidebarRows.map((row) => (
                <li key={row.id}>
                  <button
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-neutral-50",
                      selected === row.id ? "border-blue-500 ring-1 ring-blue-500" : "border-neutral-200"
                    )}
                    onClick={() => setSelected(row.id)}
                  >
                    <div className="line-clamp-1 font-medium text-neutral-800">
                      {row.title || row.slug || row.code || row.id}
                    </div>
                    <div className="line-clamp-2 text-xs text-neutral-500">
                      {row.pitch || row.slug || row.code}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* CONTENT */}
      <main className="mx-auto w-full max-w-6xl p-6">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-600 to-blue-400" />
            <h1 className="text-lg font-semibold">Journey Maintenance</h1>
            {selected && <span className="text-sm text-neutral-500">({selected})</span>}
          </div>
          {selected && (
            <div className="flex gap-2">
              <ToolbarButton onClick={() => data.reload()} disabled={data.loading}>
                <RefreshCcw className={cn("h-4 w-4", data.loading && "animate-spin")} />
                Refresh
              </ToolbarButton>
              <ToolbarButton onClick={() => setShowGEEditor((s) => !s)}>
                <Save className="h-4 w-4" />
                {showGEEditor ? "Close editor" : "Edit master"}
              </ToolbarButton>
            </div>
          )}
        </header>

        {!selected ? (
          <div className="rounded-lg border bg-white p-8 text-center text-neutral-600">
            Seleziona un <span className="font-medium">Group Event</span> dalla colonna di sinistra.
          </div>
        ) : data.loading ? (
          <div className="flex items-center justify-center py-24 text-neutral-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading data…
          </div>
        ) : data.err ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {data.err}
          </div>
        ) : (
          <div className="space-y-6">
            {/* group_events master */}
            <Section
              title="group_events (master)"
              right={
                <div className="flex gap-2">
                  <ToolbarButton onClick={() => data.reload()}>
                    <RefreshCcw className="h-4 w-4" />
                    Reload
                  </ToolbarButton>
                  <ToolbarButton onClick={() => setShowGEEditor((s) => !s)}>
                    <Save className="h-4 w-4" />
                    {showGEEditor ? "Close editor" : "Edit JSON"}
                  </ToolbarButton>
                </div>
              }
            >
              {!showGEEditor ? (
                <KV obj={data.groupEvent} />
              ) : (
                <JsonEditor
                  initial={data.groupEvent ?? {}}
                  pkHint="UPDATE by id (uuid) su tabella group_events"
                  disabled={busy}
                  onCancel={() => setShowGEEditor(false)}
                  onSave={async (payload) => {
                    if (!selected) return;
                    try {
                      setBusy(true);
                      await crud.geUpdate(selected, payload);
                      await data.reload();
                      setShowGEEditor(false);
                    } catch (e: any) {
                      alert(e?.message ?? "Update error");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              )}
            </Section>

            {/* group_event_translations */}
            <Section
              title="group_event_translations"
              right={
                <ToolbarButton
                  onClick={() =>
                    setTempEditors((s) => ({
                      ...s,
                      getCreate: { group_event_id: selected, lang: "it", title: "" },
                    }))
                  }
                >
                  <Plus className="h-4 w-4" />
                  New
                </ToolbarButton>
              }
            >
              <ListTable
                rows={data.geTranslations}
                columns={[
                  { key: "id", label: "id" },
                  { key: "lang", label: "lang" },
                  { key: "title", label: "title" },
                  { key: "short_name", label: "short_name" },
                  { key: "video_url", label: "video_url" },
                ]}
                onEdit={(row) =>
                  setTempEditors((s) => ({
                    ...s,
                    getEdit: row,
                  }))
                }
                onDelete={async (row) => {
                  if (!confirm(`Delete translation id=${row.id}?`)) return;
                  try {
                    setBusy(true);
                    await crud.getDelete(row.id);
                    await data.reload();
                  } catch (e: any) {
                    alert(e?.message ?? "Delete error");
                  } finally {
                    setBusy(false);
                  }
                }}
              />

              <Editors
                labelCreate="Create translation (group_event_translations)"
                labelEdit="Edit translation (group_event_translations)"
                pkHint="PK = id (uuid)"
                tempKeyCreate="getCreate"
                tempKeyEdit="getEdit"
                onCancel={() => setTempEditors((s) => ({ ...s, getCreate: null, getEdit: null }))}
                onCreate={async (payload) => {
                  try {
                    setBusy(true);
                    await crud.getCreate(payload);
                    await data.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                onEdit={async (payload) => {
                  try {
                    setBusy(true);
                    await crud.getUpdate(payload.id, payload);
                    await data.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                tempEditors={tempEditors}
                setTempEditors={setTempEditors}
                busy={busy}
                reload={data.reload}
              />
            </Section>

            {/* event_group_event (links) */}
            <Section
              title="event_group_event (links)"
              right={
                <ToolbarButton
                  onClick={() =>
                    setTempEditors((s) => ({
                      ...s,
                      egeCreate: { group_event_id: selected, event_id: "" },
                    }))
                  }
                >
                  <Plus className="h-4 w-4" />
                  New link
                </ToolbarButton>
              }
            >
              <ListTable
                rows={data.links}
                columns={[
                  { key: "id", label: "id" },
                  { key: "event_id", label: "event_id" },
                  { key: "group_event_id", label: "group_event_id" },
                  { key: "created_at", label: "created_at" },
                ]}
                onEdit={(row) => setTempEditors((s) => ({ ...s, egeEdit: row }))}
                onDelete={async (row) => {
                  if (!confirm(`Delete link id=${row.id}?`)) return;
                  try {
                    setBusy(true);
                    await crud.egeDelete(row.id);
                    await data.reload();
                  } catch (e: any) {
                    alert(e?.message ?? "Delete error");
                  } finally {
                    setBusy(false);
                  }
                }}
              />

              <Editors
                labelCreate="Create link (event_group_event)"
                labelEdit="Edit link (event_group_event)"
                pkHint="PK = id (uuid)"
                tempKeyCreate="egeCreate"
                tempKeyEdit="egeEdit"
                onCancel={() => setTempEditors((s) => ({ ...s, egeCreate: null, egeEdit: null }))}
                onCreate={async (payload) => {
                  try {
                    setBusy(true);
                    await crud.egeCreate(payload);
                    await data.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                onEdit={async (payload) => {
                  try {
                    setBusy(true);
                    await crud.egeUpdate(payload.id, payload);
                    await data.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                tempEditors={tempEditors}
                setTempEditors={setTempEditors}
                busy={busy}
                reload={data.reload}
              />
            </Section>

            {/* events_list collegate */}
            <Section
              title="events_list (linked)"
              right={
                <ToolbarButton
                  onClick={() =>
                    setTempEditors((s) => ({
                      ...s,
                      evCreate: { id: undefined, era: "AD" },
                    }))
                  }
                >
                  <Plus className="h-4 w-4" />
                  New event
                </ToolbarButton>
              }
            >
              <ListTable
                rows={data.events}
                columns={[
                  { key: "id", label: "id" },
                  { key: "era", label: "era" },
                  { key: "exact_date", label: "exact_date" },
                  { key: "year_from", label: "year_from" },
                  { key: "year_to", label: "year_to" },
                  { key: "country", label: "country" },
                  { key: "location", label: "location" },
                ]}
                onEdit={(row) => setTempEditors((s) => ({ ...s, evEdit: row }))}
                onDelete={async (row) => {
                  if (!confirm(`Delete event id=${row.id}?`)) return;
                  try {
                    setBusy(true);
                    await crud.evDelete(row.id);
                    await data.reload();
                  } catch (e: any) {
                    alert(e?.message ?? "Delete error");
                  } finally {
                    setBusy(false);
                  }
                }}
              />

              <Editors
                labelCreate="Create event (events_list)"
                labelEdit="Edit event (events_list)"
                pkHint="PK = id (uuid)"
                tempKeyCreate="evCreate"
                tempKeyEdit="evEdit"
                onCancel={() => setTempEditors((s) => ({ ...s, evCreate: null, evEdit: null }))}
                onCreate={async (payload) => {
                  try {
                    setBusy(true);
                    await crud.evCreate(payload);
                    await data.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                onEdit={async (payload) => {
                  try {
                    setBusy(true);
                    await crud.evUpdate(payload.id, payload);
                    await data.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                tempEditors={tempEditors}
                setTempEditors={setTempEditors}
                busy={busy}
                reload={data.reload}
              />
            </Section>

            {/* per-event: translations + type_map */}
            {data.events.map((ev) => (
              <Section
                key={ev.id}
                title={`event ${ev.id} — ${getEventTitle(ev.id)}`}
                defaultOpen={false}
                right={
                  <div className="text-xs text-neutral-500">
                    {ev.era} {ev.year_from}→{ev.year_to} — {ev.country ?? "—"} {ev.location ?? ""}
                  </div>
                }
              >
                {/* event_translations */}
                <div className="mb-4 space-y-2">
                  <div className="text-sm font-medium">event_translations</div>
                  <ListTable
                    rows={(data.eventTranslations[ev.id] ?? [])}
                    columns={[
                      { key: "id", label: "id" },
                      { key: "lang", label: "lang" },
                      { key: "title", label: "title" },
                      { key: "wikipedia_url", label: "wikipedia_url" },
                      { key: "video_url", label: "video_url" },
                    ]}
                    onEdit={(row) => setTempEditors((s) => ({ ...s, etEdit: row }))}
                    onDelete={async (row) => {
                      if (!confirm(`Delete event_translation id=${row.id}?`)) return;
                      try {
                        setBusy(true);
                        await useCRUD().etDelete(row.id);
                        await data.reload();
                      } catch (e: any) {
                        alert(e?.message ?? "Delete error");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <div>
                    <ToolbarButton
                      onClick={() =>
                        setTempEditors((s) => ({
                          ...s,
                          etCreate: { event_id: ev.id, lang: "it", title: "" },
                        }))
                      }
                    >
                      <Plus className="h-4 w-4" />
                      New translation
                    </ToolbarButton>
                  </div>
                </div>

                {/* event_type_map */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">event_type_map</div>
                  <ListTable
                    rows={(data.eventTypeMap[ev.id] ?? [])}
                    columns={[
                      { key: "event_id", label: "event_id" },
                      { key: "type_code", label: "type_code" },
                      { key: "assigned_at", label: "assigned_at" },
                    ]}
                    pkInfo="PK composta: event_id + type_code"
                    onEdit={(row) => setTempEditors((s) => ({ ...s, etmEdit: row }))}
                    onDelete={async (row) => {
                      if (!confirm(`Delete type_map event_id=${row.event_id} type_code=${row.type_code}?`)) return;
                      try {
                        setBusy(true);
                        await useCRUD().etmDelete({ event_id: row.event_id, type_code: row.type_code });
                        await data.reload();
                      } catch (e: any) {
                        alert(e?.message ?? "Delete error");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <ToolbarButton
                      onClick={() =>
                        setTempEditors((s) => ({
                          ...s,
                          etmCreate: { event_id: ev.id, type_code: "" },
                        }))
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Add type
                    </ToolbarButton>
                    <span className="text-xs text-neutral-500">
                      Tipi disponibili: {data.eventTypes.map((t) => t.code).join(", ") || "—"}
                    </span>
                  </div>
                </div>
              </Section>
            ))}

            {/* event_types (lookup) */}
            <Section
              title="event_types (lookup)"
              right={
                <ToolbarButton
                  onClick={() =>
                    setTempEditors((s) => ({
                      ...s,
                      etypeCreate: { code: "", label_en: "", label_it: "" },
                    }))
                  }
                >
                  <Plus className="h-4 w-4" />
                  New type
                </ToolbarButton>
              }
              defaultOpen={false}
            >
              <ListTable
                rows={data.eventTypes}
                columns={[
                  { key: "code", label: "code" },
                  { key: "label_en", label: "label_en" },
                  { key: "label_it", label: "label_it" },
                  { key: "icon_name", label: "icon_name" },
                  { key: "sort_order", label: "sort_order" },
                ]}
                onEdit={(row) => setTempEditors((s) => ({ ...s, etypeEdit: row }))}
                onDelete={async (row) => {
                  if (!confirm(`Delete event_type code=${row.code}?`)) return;
                  try {
                    setBusy(true);
                    await useCRUD().etypeDelete(row.code);
                    await data.reload();
                  } catch (e: any) {
                    alert(e?.message ?? "Delete error");
                  } finally {
                    setBusy(false);
                  }
                }}
              />

              <Editors
                labelCreate="Create type (event_types)"
                labelEdit="Edit type (event_types)"
                pkHint="PK = code (text)"
                tempKeyCreate="etypeCreate"
                tempKeyEdit="etypeEdit"
                onCancel={() => setTempEditors((s) => ({ ...s, etypeCreate: null, etypeEdit: null }))}
                onCreate={async (payload) => {
                  try {
                    setBusy(true);
                    await useCRUD().etypeCreate(payload);
                    await data.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                onEdit={async (payload) => {
                  try {
                    setBusy(true);
                    await useCRUD().etypeUpdate(payload.code, payload);
                    await data.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                tempEditors={tempEditors}
                setTempEditors={setTempEditors}
                busy={busy}
                reload={data.reload}
              />
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}
