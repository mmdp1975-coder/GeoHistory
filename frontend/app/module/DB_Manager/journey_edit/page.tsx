"use client";

/**
 * GeoHistory Journey — DB Manager
 * Path: app/module/DB_Manager/journey_edit/page.tsx
 *
 * Funzioni in questo step:
 * - Lista e ricerca dei group_events (sidebar)
 * - Dettaglio JSON del record selezionato
 * - Save (update) e Delete sul record selezionato
 *
 * Usa l’istanza Supabase esportata di default da "@/lib/supabaseBrowserClient".
 */

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseBrowserClient";
import {
  Loader2,
  RefreshCcw,
  Search,
  Save,
  Trash2,
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
function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
        disabled && "cursor-not-allowed opacity-60",
        variant === "default" &&
          "border-neutral-200 bg-white hover:bg-neutral-50",
        variant === "danger" &&
          "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
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

  useEffect(() => {
    // quando cambia "initial", riallineo l’editor
    setText(toPrettyJSON(initial ?? {}));
    setErr(null);
  }, [initial]);

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
        rows={20}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        disabled={disabled}
      />
      {err && <div className="text-sm text-red-600">JSON error: {err}</div>}
      <div className="flex gap-2">
        <ToolbarButton onClick={onCancel} disabled={disabled} title="Annulla modifiche">
          Cancel
        </ToolbarButton>
        <ToolbarButton onClick={handleSave} disabled={disabled} title="Salva modifiche">
          <Save className="h-4 w-4" />
          Save
        </ToolbarButton>
      </div>
    </div>
  );
}

/* ------------------------ SUPABASE HOOK ------------------------ */
function useSB() {
  return useMemo(() => supabase, []);
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

/* ------------------------ DATA HOOK: LISTA ------------------------ */
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

/* ------------------------ DATA HOOK: DETTAGLIO ------------------------ */
function useGroupEventDetail(selectedId: UUID | null) {
  const sb = useSB();
  const [loading, setLoading] = useState(false);
  const [row, setRow] = useState<Row | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function load() {
    if (!selectedId) {
      setRow(null);
      setErrorMsg(null);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await sb
        .from("group_events")
        .select("*")
        .eq("id", selectedId)
        .single();
      if (error) throw error;
      setRow(data as Row);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error loading detail");
      setRow(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function save(payload: Row) {
    if (!selectedId) return;
    // Mantiene l'id immutato
    if (payload.id && payload.id !== selectedId) {
      throw new Error("The 'id' field cannot be changed.");
    }
    const { error } = await sb
      .from("group_events")
      .update(payload)
      .eq("id", selectedId);
    if (error) throw error;
    await load();
  }

  async function remove() {
    if (!selectedId) return;
    const { error } = await sb
      .from("group_events")
      .delete()
      .eq("id", selectedId);
    if (error) throw error;
    setRow(null);
  }

  return { row, loading, errorMsg, reload: load, save, remove };
}

/* ------------------------ PAGE ------------------------ */
export default function JourneyEditPage() {
  const {
    rows: sidebarRows,
    q,
    setQ,
    page,
    setPage,
    count,
    loading: loadingSidebar,
    reload: reloadSidebar,
  } = useGroupEvents();

  const [selected, setSelected] = useState<UUID | null>(null);
  const {
    row: detail,
    loading: loadingDetail,
    errorMsg: errorDetail,
    reload: reloadDetail,
    save,
    remove,
  } = useGroupEventDetail(selected);

  async function handleSave(payload: Row) {
    await save(payload);
    await reloadSidebar();
  }

  async function handleDelete() {
    if (!selected) return;
    const ok = window.confirm("Confermi la cancellazione di questo Group Event?");
    if (!ok) return;
    await remove();
    await reloadSidebar();
    setSelected(null);
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* SIDEBAR */}
      <aside className="sticky top-0 h-screen w-[360px] shrink-0 border-r bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-base font-semibold">Group Events</div>
          <ToolbarButton onClick={reloadSidebar} disabled={loadingSidebar} title="Reload list">
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

      {/* MAIN */}
      <main className="mx-auto w-full max-w-6xl p-6">
        <h1 className="mb-4 text-lg font-semibold">Journey Maintenance</h1>

        {!selected ? (
          <div className="rounded-lg border bg-white p-8 text-center text-neutral-600">
            Seleziona un <span className="font-medium">Group Event</span> dalla colonna di sinistra.
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between border-b px-2 pb-3">
              <div className="text-sm font-medium">
                Selected ID: <span className="font-mono">{selected}</span>
              </div>
              <div className="flex gap-2">
                <ToolbarButton
                  onClick={reloadDetail}
                  disabled={loadingDetail}
                  title="Ricarica dettaglio"
                >
                  <RefreshCcw className={cn("h-4 w-4", loadingDetail && "animate-spin")} />
                  Reload
                </ToolbarButton>
                <ToolbarButton
                  onClick={handleDelete}
                  disabled={loadingDetail}
                  title="Cancella"
                  variant="danger"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </ToolbarButton>
              </div>
            </div>

            <div className="p-4">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-12 text-neutral-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading detail…
                </div>
              ) : errorDetail ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {errorDetail}
                </div>
              ) : !detail ? (
                <div className="text-sm text-neutral-500">Nessun dato</div>
              ) : (
                <JsonEditor
                  initial={detail}
                  onSave={handleSave}
                  onCancel={reloadDetail}
                  disabled={loadingDetail}
                  label="group_events — JSON editor"
                  pkHint="Nota: il campo 'id' non può essere modificato."
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
