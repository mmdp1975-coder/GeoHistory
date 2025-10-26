"use client";

/**
 * GeoHistory Journey — DB Manager
 * Path: app/module/DB_Manager/journey_edit/page.tsx
 *
 * Permette la gestione CRUD dei group_events e relative tabelle collegate.
 * Versione aggiornata: rimossi riferimenti ai campi obsoleti is_official, color_hex, icon_name da group_events.
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

/* ------------------------ SUPABASE HOOK ------------------------ */
function useSB() {
  return useMemo(() => getBrowserSupabase(), []);
}

/* ------------------------ TYPES ------------------------ */
type GroupEvent = {
  id: UUID;
  code: string | null;
  slug: string | null;
  title: string | null;
  pitch: string | null;
  updated_at?: string | null;
};

/* ------------------------ MAIN HOOKS ------------------------ */
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

/* ------------------------ COMPONENTE PRINCIPALE ------------------------ */
export default function JourneyEditPage() {
  const { rows: sidebarRows, q, setQ, page, setPage, count, loading: loadingSidebar, reload: reloadSidebar } =
    useGroupEvents();

  const [selected, setSelected] = useState<UUID | null>(null);

  return (
    <div className="flex min-h-screen bg-neutral-50">
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

      <main className="mx-auto w-full max-w-6xl p-6">
        <h1 className="text-lg font-semibold mb-4">Journey Maintenance</h1>
        <div className="rounded-lg border bg-white p-8 text-center text-neutral-600">
          Seleziona un <span className="font-medium">Group Event</span> dalla colonna di sinistra.
        </div>
      </main>
    </div>
  );
}
