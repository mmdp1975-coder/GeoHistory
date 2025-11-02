"use client";

/**
 * GeoHistory — DB Manager (solo ADMIN/MOD)
 * Usa l'hook centralizzato useCurrentUser()
 * - Sidebar sticky + intestazioni sticky
 * - CRUD inline (insert/update/delete) con RLS
 * - Elenco tabelle da RPC → view → fallback
 * - Aggiunge tabella log se presente (db_logs | logs | audit_log)
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useCurrentUser } from "@/lib/useCurrentUser";

/* ===== ROUTES ===== */
const JOURNEYS_EDIT_PATH = "/module/build-journey";
const USERS_EDIT_PATH = "/module/DB_Manager/users_edit";

/* ===== FALLBACK ===== */
const TABLE_WHITELIST: string[] = [];

/* ===== LOG TABLE CANDIDATES ===== */
const LOG_TABLE_CANDIDATES = ["db_logs", "logs", "audit_log"];

const DEFAULT_PAGE_SIZE = 25;

/* ===== TIPI ===== */
type ColumnMeta = { name: string; type: string };
type TableMeta = { table: string; columns: ColumnMeta[] };

type EditState =
  | { mode: "none" }
  | { mode: "edit"; pkName: string | null; pkValue: string | number | null; values: Record<string, any> }
  | { mode: "create"; values: Record<string, any> };

export default function DBManagerPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { checking, error, isAdminOrMod } = useCurrentUser();

  /* ========== LISTA TABELLE ========== */
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tablesSource, setTablesSource] = useState<"rpc" | "v_admin_tables" | "whitelist" | null>(null);

  const [sidebarSearch, setSidebarSearch] = useState<string>("");
  const visibleTables = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    return q ? tables.filter((t) => t.toLowerCase().includes(q)) : tables;
  }, [tables, sidebarSearch]);

  const [selectedTable, setSelectedTable] = useState<string>("");

  const tryDetectLogTable = useCallback(async (): Promise<string | null> => {
    for (const name of LOG_TABLE_CANDIDATES) {
      const probe = await supabase.from(name).select("*", { head: true, count: "exact" }).limit(1);
      if (!probe.error) return name;
    }
    return null;
  }, [supabase]);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    setTablesError(null);
    setTablesSource(null);

    try {
      // 1) RPC preferita
      const rpc = await supabase.rpc("gh_list_all_tables");
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
        let list = Array.from(new Set(rpc.data.map((d: any) => d?.table_name).filter(Boolean)));
        const logName = await tryDetectLogTable();
        if (logName && !list.includes(logName)) list.push(logName);
        list.sort((a, b) => a.localeCompare(b));
        setTables(list);
        setTablesSource("rpc");
        if (!selectedTable && list.length) setSelectedTable(list[0]);
        return;
      }

      // 2) View
      const v = await supabase.from("v_admin_tables").select("table_name");
      if (!v.error && Array.isArray(v.data) && v.data.length > 0) {
        let list = Array.from(new Set(v.data.map((d: any) => d?.table_name).filter(Boolean)));
        const logName = await tryDetectLogTable();
        if (logName && !list.includes(logName)) list.push(logName);
        list.sort((a, b) => a.localeCompare(b));
        setTables(list);
        setTablesSource("v_admin_tables");
        if (!selectedTable && list.length) setSelectedTable(list[0]);
        return;
      }

      // 3) Fallback
      let list = [...TABLE_WHITELIST];
      const logName = await tryDetectLogTable();
      if (logName && !list.includes(logName)) list.push(logName);
      list.sort((a, b) => a.localeCompare(b));
      setTables(list);
      setTablesSource("whitelist");
      if (!selectedTable && list.length) setSelectedTable(list[0]);

      if (list.length === 0) setTablesError("Nessuna tabella disponibile. Verifica RPC/view.");
    } catch (e: any) {
      let list = [...TABLE_WHITELIST];
      const logName = await tryDetectLogTable();
      if (logName && !list.includes(logName)) list.push(logName);
      list.sort((a, b) => a.localeCompare(b));
      setTables(list);
      setTablesSource("whitelist");
      if (!selectedTable && list.length) setSelectedTable(list[0]);
      setTablesError(e?.message ?? "Errore nel caricamento elenco tabelle.");
    } finally {
      setTablesLoading(false);
    }
  }, [supabase, selectedTable, tryDetectLogTable]);

  // carica tabelle una sola volta quando l'utente è autorizzato
  const tablesInitRef = useRef(false);
  useEffect(() => {
    if (!isAdminOrMod) return;
    if (tablesInitRef.current) return;
    tablesInitRef.current = true;
    void loadTables();
  }, [isAdminOrMod, loadTables]);

  /* ========== DATI TABELLA / CRUD ========== */
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [meta, setMeta] = useState<TableMeta | null>(null);

  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [quickFilter, setQuickFilter] = useState<string>("");

  const [editing, setEditing] = useState<EditState>({ mode: "none" });
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2600);
  };

  const filteredRows = useMemo(() => {
    const q = quickFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r ?? {}).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, quickFilter]);

  const guessType = (v: any): string => {
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "number") return "number";
    if (v === null || v === undefined) return "";
    if (typeof v === "string") {
      const s = v.trim();
      if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) return "json";
      if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return "timestamp";
      return "text";
    }
    if (typeof v === "object") return "json";
    return "";
  };

  const columnType = (m: TableMeta | null, col: string): string => {
    const t = m?.columns?.find((c) => c.name === col)?.type ?? "";
    return t.toLowerCase();
  };

  const detectPk = (cols: string[]): string | null => {
    if (cols.includes("id")) return "id";
    if (cols.includes("uuid")) return "uuid";
    if (cols.includes("pk")) return "pk";
    return null;
  };

  const loadMeta = useCallback(async (table: string) => {
    try {
      const { data, error } = await supabase.from(table).select("*").limit(1);
      if (error) throw error;
      const cols: ColumnMeta[] = [];
      const sample = data?.[0] ?? null;
      if (sample) for (const k of Object.keys(sample)) cols.push({ name: k, type: guessType(sample[k]) });
      setMeta({ table, columns: cols });
    } catch {
      setMeta({ table, columns: [] });
    }
  }, [supabase]);

  const loadRows = useCallback(async (table: string, p: number, ps: number) => {
    if (!table) return;
    setRowsLoading(true);
    setRowsError(null);
    try {
      const from = (p - 1) * ps;
      const to = from + ps - 1;
      const { data, error } = await supabase.from(table).select("*").range(from, to);
      if (error) throw error;
      const arr = Array.isArray(data) ? data : [];
      setRows(arr);
      setColumns(arr.length ? Object.keys(arr[0]) : []);
    } catch (e: any) {
      setRows([]);
      setColumns([]);
      setRowsError(e?.message ?? "Errore nel caricamento della tabella.");
    } finally {
      setRowsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!selectedTable) return;
    setEditing({ mode: "none" });
    setQuickFilter("");
    void loadMeta(selectedTable);
    void loadRows(selectedTable, page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, page, pageSize]);

  const pkName = useMemo(() => detectPk(columns), [columns]);

  const onStartCreate = () => {
    const blank: Record<string, any> = {};
    for (const c of columns) blank[c] = null;
    if (pkName) delete blank[pkName];
    setEditing({ mode: "create", values: blank });
  };

  const onStartEdit = (row: any) => {
    setEditing({ mode: "edit", pkName, pkValue: pkName ? row[pkName] ?? null : null, values: { ...row } });
  };

  const onCancelEdit = () => setEditing({ mode: "none" });

  const onFieldChange = (col: string, value: any) => {
    setEditing((prev) =>
      prev.mode === "none" ? prev : ({ ...prev, values: { ...prev.values, [col]: value } } as EditState)
    );
  };

  const onSave = async () => {
    try {
      if (editing.mode === "create") {
        const { error } = await supabase.from(selectedTable).insert(editing.values);
        if (error) throw error;
        showToast("success", "Riga creata.");
      } else if (editing.mode === "edit") {
        if (editing.pkName && editing.pkValue !== null && editing.pkValue !== undefined) {
          const { error } = await supabase
            .from(selectedTable)
            .update(editing.values)
            .eq(editing.pkName, editing.pkValue);
          if (error) throw error;
          showToast("success", "Riga aggiornata.");
        } else {
          const { error } = await supabase.from(selectedTable).upsert(editing.values);
          if (error) throw error;
          showToast("success", "Riga aggiornata (upsert).");
        }
      }
      setEditing({ mode: "none" });
      await loadRows(selectedTable, page, pageSize);
    } catch (e: any) {
      showToast("error", e?.message ?? "Errore nel salvataggio (RLS?).");
    }
  };

  const onDelete = async (row: any) => {
    if (!pkName) return showToast("error", "PK non riconosciuta per la cancellazione.");
    const id = row?.[pkName];
    if (id === null || id === undefined) return showToast("error", "Valore PK mancante.");
    if (!confirm(`Eliminare la riga con ${pkName} = ${id}?`)) return;
    try {
      const { error } = await supabase.from(selectedTable).delete().eq(pkName, id);
      if (error) throw error;
      showToast("success", "Riga eliminata.");
      await loadRows(selectedTable, page, pageSize);
    } catch (e: any) {
      showToast("error", e?.message ?? "Errore nell'eliminazione (RLS?).");
    }
  };

  const onRefresh = async () => {
    await loadRows(selectedTable, page, pageSize);
  };

  /* ========== RENDER ========== */

  if (checking) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-slate-600">
        Verifica permessi…
      </div>
    );
  }

  if (!isAdminOrMod) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="rounded-lg border bg-white px-5 py-4 text-center">
          <div className="mb-1 text-base font-semibold text-slate-800">Accesso negato</div>
          <div className="text-sm text-slate-600">
            {/* error potrebbe contenere 'Nessuna sessione attiva.' oppure 'Solo ADMIN/MOD' */}
            {error ?? "Solo utenti ADMIN o MOD possono accedere a questa pagina."}
          </div>
          <div className="mt-3">
            <Link href="/login" className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50">
              Vai al login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[80vh] grid-cols-1 md:grid-cols-[300px_1fr]" style={{ overflow: "hidden" }}>
      {/* ===== SIDEBAR (sticky) ===== */}
      <aside className="border-r bg-slate-50 p-4 md:sticky md:top-0 md:self-start md:h-[100vh] md:overflow-auto">
        {/* Bottoni richiesti a sinistra */}
        <div className="mb-3 flex items-center gap-2">
          <Link
            href={JOURNEYS_EDIT_PATH}
            className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
            title="Apri la pagina di editing dei Journeys"
          >
            Journeys edit
          </Link>
          <Link
            href={USERS_EDIT_PATH}
            className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
            title="Apri la pagina di editing degli Users"
          >
            Users edit
          </Link>
        </div>

        <div className="mb-2 text-sm font-semibold text-slate-700">Tabelle</div>

        <div className="mb-3">
          <input
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
            placeholder="Cerca tabella…"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-lg border bg-white">
          {tablesLoading && <div className="p-3 text-sm text-slate-500">Caricamento…</div>}
          {tablesError && <div className="p-3 text-sm text-amber-700">{tablesError}</div>}
          {!tablesLoading && tables.length === 0 && (
            <div className="p-3 text-sm text-slate-500">Nessuna tabella.</div>
          )}
          <ul className="divide-y">
            {visibleTables.map((t) => {
              const active = t === selectedTable;
              return (
                <li key={t}>
                  <button
                    onClick={() => { setSelectedTable(t); setPage(1); }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${active ? "bg-slate-100 font-medium" : ""}`}
                  >
                    {t}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {tablesSource && (
          <div className="mt-3 rounded-lg border bg-white p-3 text-xs text-slate-600">
            <div className="mb-1 font-semibold">Fonte elenco tabelle:</div>
            {tablesSource === "rpc" && <div><code>gh_list_all_tables()</code> (RPC)</div>}
            {tablesSource === "v_admin_tables" && <div><code>v_admin_tables</code> (DB view)</div>}
            {tablesSource === "whitelist" && <div><code>TABLE_WHITELIST</code> (fallback locale)</div>}
          </div>
        )}
      </aside>

      {/* ===== MAIN ===== */}
      <main className="p-6 overflow-auto">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{selectedTable ? `Tabella: ${selectedTable}` : "DB Manager"}</h1>

          <div className="ml-auto flex items-center gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              onClick={onStartCreate}
              disabled={!selectedTable || columns.length === 0}
              title="Aggiungi riga"
            >
              + Aggiungi riga
            </button>

            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              onClick={onRefresh}
              disabled={!selectedTable || rowsLoading}
              title="Aggiorna righe"
            >
              Refresh
            </button>

            <div className="hidden h-6 w-px bg-slate-200 md:block" />

            <label className="text-sm text-slate-600">Rows</label>
            <select
              className="rounded-lg border bg-white px-2 py-1 text-sm"
              value={pageSize}
              onChange={(e) => { setPageSize(parseInt(e.target.value, 10) || DEFAULT_PAGE_SIZE); setPage(1); }}
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

            <div className="hidden h-6 w-px bg-slate-200 md:block" />

            <input
              className="w-[220px] rounded-lg border bg-white px-3 py-2 text-sm"
              placeholder="Filtro veloce"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              disabled={rowsLoading}
            />
          </div>

          {/* CREATE CARD */}
          {editing.mode === "create" && (
            <div className="mb-4 rounded-xl border bg-white p-4">
              <div className="mb-2 text-sm font-semibold">Nuova riga</div>
              {columns.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Nessun metadato rilevato (tabella vuota o RLS restrittive). Inserisci i campi necessari e salva.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {columns
                    .filter((c) => (pkName ? c !== pkName : true))
                    .map((c) => (
                      <FieldEditor
                        key={c}
                        col={c}
                        type={columnType(meta, c)}
                        value={(editing.values as any)[c]}
                        onChange={(v) => onFieldChange(c, v)}
                      />
                    ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={onSave}>Salva</button>
                <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={onCancelEdit}>Annulla</button>
              </div>
            </div>
          )}

          {/* GRID */}
          <div className="overflow-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  <th className="border-b px-3 py-2 text-left">Azioni</th>
                  {columns.map((c) => (
                    <th key={c} className="border-b px-3 py-2 text-left">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  <tr><td className="px-3 py-3 text-slate-500" colSpan={columns.length + 1}>Caricamento…</td></tr>
                ) : rowsError ? (
                  <tr><td className="px-3 py-3 text-red-700" colSpan={columns.length + 1}>{rowsError}</td></tr>
                ) : filteredRows.length === 0 ? (
                  <tr><td className="px-3 py-3 text-slate-500" colSpan={columns.length + 1}>Nessun record</td></tr>
                ) : (
                  filteredRows.map((r, idx) => {
                    const pk = pkName ? r[pkName] : null;
                    const rowKey = pk != null ? String(pk) : String(idx);
                    const isEditing = editing.mode === "edit" && (pkName ? editing.pkValue === r[pkName] : false);

                    return (
                      <tr key={rowKey} className="odd:bg-white even:bg-slate-50">
                        <td className="border-b px-3 py-2 align-top">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button className="rounded border px-2 py-1" onClick={onSave}>Salva</button>
                              <button className="rounded border px-2 py-1" onClick={onCancelEdit}>Annulla</button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button className="rounded border px-2 py-1" onClick={() => onStartEdit(r)}>Edit</button>
                              <button className="rounded border px-2 py-1 text-red-700" onClick={() => onDelete(r)}>Delete</button>
                            </div>
                          )}
                        </td>
                        {columns.map((c) => {
                          const t = columnType(meta, c);
                          if (isEditing) {
                            const curr = (editing as any).values?.[c];
                            return (
                              <td key={c} className="border-b px-3 py-2 align-top">
                                <FieldEditor col={c} type={t} value={curr} onChange={(v) => onFieldChange(c, v)} compact />
                              </td>
                            );
                          }
                          return <td key={c} className="border-b px-3 py-2 align-top">{formatCell(r?.[c])}</td>;
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINAZIONE */}
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-slate-600">Page {page}</span>
            <div className="ml-auto flex items-center gap-2">
              <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || rowsLoading}>
                Prev
              </button>
              <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setPage((p) => p + 1)} disabled={rowsLoading || rows.length < pageSize}>
                Next
              </button>
            </div>
          </div>

          {/* TOAST */}
          {toast && (
            <div
              className={`fixed bottom-4 right-4 rounded-lg px-4 py-3 text-sm shadow-lg ${
                toast.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {toast.msg}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ================== HELPERS ================== */

function formatCell(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  if (typeof v === "string" && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    const d = new Date(v); if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(v);
}

function FieldEditor({
  col, type, value, onChange, compact = false,
}: { col: string; type: string; value: any; onChange: (v: any) => void; compact?: boolean; }) {
  const isBool = type.includes("bool");
  const isNum =
    type.includes("int") || type.includes("numeric") || type.includes("float") || type.includes("double") || type === "number";
  const isJSON = type.includes("json");
  const isTexty = !isBool && !isNum && !isJSON;
  const isLong = typeof value === "string" && value.length >= 140;

  if (isBool) {
    return (
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-xs text-slate-600">{col}</span>
      </label>
    );
  }

  if (isNum) {
    return (
      <div className="flex flex-col">
        <label className="text-xs text-slate-600">{col}</label>
        <input
          type="number"
          className="rounded border px-2 py-1"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      </div>
    );
  }

  if (isJSON) {
    const txt = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2);
    const looksJSON =
      txt.trim() === "" ||
      (txt.trim().startsWith("{") && txt.trim().endsWith("}")) ||
      (txt.trim().startsWith("[") && txt.trim().endsWith("]"));
    return (
      <div className="flex flex-col">
        <label className="text-xs text-slate-600">{col} (JSON)</label>
        <textarea
          className="min-h-[90px] rounded border px-2 py-1 font-mono text-xs"
          value={txt}
          onChange={(e) => onChange(e.target.value)}
          placeholder='{"key":"value"}'
        />
        {!looksJSON && <span className="pt-1 text-xs text-amber-700">Non sembra JSON valido.</span>}
      </div>
    );
  }

  if (isTexty && isLong && !compact) {
    return (
      <div className="flex flex-col">
        <label className="text-xs text-slate-600">{col}</label>
        <textarea
          className="min-h-[90px] rounded border px-2 py-1"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <label className="text-xs text-slate-600">{col}</label>
      <input
        type="text"
        className="rounded border px-2 py-1"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      />
    </div>
  );
}
