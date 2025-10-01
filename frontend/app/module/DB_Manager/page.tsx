"use client";

import { useEffect, useMemo, useState } from "react";

type TableMetaCol = {
  ordinal_position: number;
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  udt_name?: string | null;
  column_default?: string | null;
};
type TableMeta = {
  table: string;
  primaryKey: string | null;
  columns: TableMetaCol[];
  foreignKeys: Array<{
    constraint_name: string;
    fk_column: string;
    ref_table: string;
    ref_column: string;
  }>;
};
type RowsResponse = {
  table: string;
  page: number;
  pageSize: number;
  total: number;
  rows: any[];
};

type EditingState =
  | { mode: "none" }
  | { mode: "edit"; id: string; original: any; values: Record<string, any> }
  | { mode: "create"; values: Record<string, any> };

/** helper: parse JSON in modo sicuro (gestisce risposte vuote) */
async function safeJson(res: Response) {
  const txt = await res.text();
  if (!txt) {
    if (res.ok) return {};
    throw new Error(`HTTP ${res.status} (empty body)`);
  }
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(txt);
  }
}

export default function DBManagerPage() {
  // Dropdown tables
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesErr, setTablesErr] = useState<string | null>(null);

  // Selected table
  const [table, setTable] = useState<string>("");

  // Meta
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  // Rows
  const [rows, setRows] = useState<any[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsErr, setRowsErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Editing
  const [editing, setEditing] = useState<EditingState>({ mode: "none" });
  const [opMsg, setOpMsg] = useState<string | null>(null);

  // Load tables for dropdown
  useEffect(() => {
    const run = async () => {
      try {
        setTablesLoading(true);
        setTablesErr(null);
        const res = await fetch("/api/admin-db/tables", { cache: "no-store" });
        const json = await safeJson(res);
        if (!res.ok) throw new Error((json as any)?.error || "Failed loading tables");
        const list: string[] = Array.isArray((json as any).tables) ? (json as any).tables : [];
        setTables(list);
        if (!table && list.length) setTable(list[0]);
      } catch (e: any) {
        setTablesErr(e?.message ?? "Tables load error");
        setTables([]);
      } finally {
        setTablesLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When table changes, reset paging and state
  useEffect(() => {
    if (!table) return;
    setPage(1);
    setEditing({ mode: "none" });
    setOpMsg(null);
  }, [table]);

  // Load meta (normalize to arrays)
  useEffect(() => {
    const run = async () => {
      if (!table) {
        setMeta(null);
        return;
      }
      try {
        setMetaLoading(true);
        setMetaErr(null);
        const res = await fetch(`/api/admin-db/${encodeURIComponent(table)}/meta`, { cache: "no-store" });
        const json: any = await safeJson(res);
        if (!res.ok) throw new Error(json?.error || "Failed loading meta");
        const normalized: TableMeta = {
          table: json.table ?? table,
          primaryKey: json.primaryKey ?? null,
          columns: Array.isArray(json.columns) ? json.columns : [],
          foreignKeys: Array.isArray(json.foreignKeys) ? json.foreignKeys : [],
        };
        setMeta(normalized);
      } catch (e: any) {
        setMetaErr(e?.message ?? "Meta load error");
        setMeta({ table, primaryKey: null, columns: [], foreignKeys: [] });
      } finally {
        setMetaLoading(false);
      }
    };
    run();
  }, [table]);

  // Load rows
  useEffect(() => {
    const run = async () => {
      if (!table) {
        setRows([]); setTotal(0);
        return;
      }
      try {
        setRowsLoading(true);
        setRowsErr(null);
        const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }).toString();
        const res = await fetch(`/api/admin-db/${encodeURIComponent(table)}?${qs}`, { cache: "no-store" });
        const json: any = await safeJson(res);
        if (!res.ok) throw new Error(json?.error || "Failed loading rows");
        setRows(Array.isArray(json.rows) ? json.rows : []);
        setTotal(Number(json.total || 0));
      } catch (e: any) {
        setRowsErr(e?.message ?? "Rows load error");
        setRows([]); setTotal(0);
      } finally {
        setRowsLoading(false);
      }
    };
    run();
  }, [table, page, pageSize]);

  // Colonne: usa meta, altrimenti union chiavi righe
  const columns = useMemo(() => {
    const metaCols = meta?.columns?.map((c) => c.column_name) ?? [];
    if (metaCols.length > 0) return metaCols;
    const keys = new Set<string>();
    for (const r of rows.slice(0, 50)) Object.keys(r || {}).forEach((k) => keys.add(k));
    return Array.from(keys);
  }, [meta, rows]);

  // PK: usa meta.primaryKey, altrimenti fallback "id" se presente tra le colonne
  const primaryKey = useMemo(() => {
    if (meta?.primaryKey) return meta.primaryKey;
    return columns.includes("id") ? "id" : null;
  }, [meta, columns]);

  const totalPages = useMemo(() => (total ? Math.max(1, Math.ceil(total / pageSize)) : 1), [total, pageSize]);

  // Helpers
  const isEditingRow = (row: any) =>
    editing.mode === "edit" && primaryKey && String(row?.[primaryKey]) === editing.id;

  const startEdit = (row: any) => {
    if (!primaryKey) return;
    setEditing({ mode: "edit", id: String(row[primaryKey]), original: row, values: { ...row } });
    setOpMsg(null);
  };

  const startCreate = () => {
    const blank: Record<string, any> = {};
    for (const c of columns) blank[c] = null;
    if (primaryKey) delete blank[primaryKey]; // non impostare la PK
    setEditing({ mode: "create", values: blank });
    setOpMsg(null);
  };

  const cancelEdit = () => setEditing({ mode: "none" });

  const onFieldChange = (col: string, v: any) => {
    setEditing((prev) => {
      if (prev.mode === "none") return prev;
      return { ...prev, values: { ...prev.values, [col]: v } } as EditingState;
    });
  };

  const refreshRows = async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }).toString();
    const r = await fetch(`/api/admin-db/${encodeURIComponent(table)}?${qs}`, { cache: "no-store" });
    const j: any = await safeJson(r);
    if (r.ok) {
      setRows(Array.isArray(j.rows) ? j.rows : []);
      setTotal(Number(j.total || 0));
    }
  };

  const saveEdit = async () => {
    try {
      if (editing.mode === "edit") {
        const id = editing.id;
        const res = await fetch(`/api/admin-db/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing.values),
        });
        const json: any = await safeJson(res);
        if (!res.ok) throw new Error(json?.error || "Update failed");
        setOpMsg(`Updated ${json.updated?.length ?? 0} row(s).`);
      } else if (editing.mode === "create") {
        const res = await fetch(`/api/admin-db/${encodeURIComponent(table)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing.values),
        });
        const json: any = await safeJson(res);
        if (!res.ok) throw new Error(json?.error || "Insert failed");
        setOpMsg(`Inserted ${json.inserted?.length ?? 0} row(s).`);
      }
      setEditing({ mode: "none" });
      await refreshRows();
    } catch (e: any) {
      setOpMsg(e?.message ?? "Save error");
    }
  };

  const deleteRow = async (row: any) => {
    if (!primaryKey) return;
    const id = String(row[primaryKey]);
    if (!confirm(`Delete row with ${primaryKey} = ${id}?`)) return;
    try {
      const res = await fetch(`/api/admin-db/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, { method: "DELETE" });
      const json: any = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      setOpMsg(`Deleted ${json.deleted?.length ?? 0} row(s).`);
      await refreshRows();
    } catch (e: any) {
      setOpMsg(e?.message ?? "Delete error");
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-2xl font-semibold">DB Manager</h1>

      {/* TABELLE */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">Table</label>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          disabled={tablesLoading || !tables.length}
        >
          {!tables.length && <option value="">—</option>}
          {tables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {tablesLoading && <span className="text-sm text-slate-500">loading…</span>}
        {tablesErr && <span className="text-sm text-red-600">{tablesErr}</span>}

        <button
          className="ml-auto rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          onClick={startCreate}
          disabled={columns.length === 0}
          title="Insert new row"
        >
          + Add row
        </button>
      </div>

      {/* META */}
      <div className="mt-2">
        {metaLoading && <p className="text-sm text-slate-500">loading meta…</p>}
        {metaErr && <p className="text-sm text-red-600">{metaErr}</p>}
        {!!meta && (
          <span className="text-xs text-gray-600">
            PK: <b>{primaryKey ?? "—"}</b> • Columns: {columns.length}
            {meta?.columns?.length === 0 && rows.length > 0 ? (
              <em className="ml-2 text-[11px] text-slate-500">(derivate dai dati)</em>
            ) : null}
          </span>
        )}
      </div>

      {/* MESSAGGI */}
      {opMsg && <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs">{opMsg}</div>}

      {/* ROWS */}
      <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse bg-white text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-slate-700 border-b">Actions</th>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-left font-medium text-slate-700 border-b">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Riga di INSERT */}
            {editing.mode === "create" && (
              <tr className="bg-yellow-50">
                <td className="px-2 py-2 border-b">
                  <div className="flex gap-2">
                    <button className="rounded border px-2 py-1" onClick={saveEdit}>Save</button>
                    <button className="rounded border px-2 py-1" onClick={cancelEdit}>Cancel</button>
                  </div>
                </td>
                {columns.map((c) => (
                  <td key={c} className="px-3 py-2 border-b">
                    <CellEditor
                      value={(editing.values as any)?.[c] ?? ""}
                      onChange={(v) => onFieldChange(c, v)}
                      disabled={false}
                    />
                  </td>
                ))}
              </tr>
            )}

            {/* RIGHE */}
            {rowsLoading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={columns.length + 1}>loading rows…</td>
              </tr>
            ) : rowsErr ? (
              <tr>
                <td className="px-3 py-3 text-red-600" colSpan={columns.length + 1}>{rowsErr}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={columns.length + 1}>Nessun record</td>
              </tr>
            ) : (
              rows.map((r, idx) => {
                const editingRow = isEditingRow(r);
                return (
                  <tr key={primaryKey ? String(r[primaryKey]) : idx} className="odd:bg-white even:bg-slate-50">
                    <td className="px-2 py-2 border-b">
                      {editingRow ? (
                        <div className="flex gap-2">
                          <button className="rounded border px-2 py-1" onClick={saveEdit}>Save</button>
                          <button className="rounded border px-2 py-1" onClick={cancelEdit}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => startEdit(r)} disabled={!primaryKey}>Edit</button>
                          <button className="rounded border px-2 py-1 text-red-700 disabled:opacity-50" onClick={() => deleteRow(r)} disabled={!primaryKey}>Delete</button>
                        </div>
                      )}
                    </td>
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-2 border-b align-top text-slate-800">
                        {editingRow ? (
                          <CellEditor value={(editing as any).values?.[c]} onChange={(v) => onFieldChange(c, v)} disabled={primaryKey === c} />
                        ) : (
                          formatCell(r?.[c])
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINAZIONE */}
      <div className="mt-3 flex items-center gap-3 text-sm">
        <button className="rounded-lg border px-3 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || rowsLoading}>← Prev</button>
        <span className="text-slate-600">Page {page} / {totalPages} · {total} rows</span>
        <button className="rounded-lg border px-3 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || rowsLoading}>Next →</button>
      </div>
    </div>
  );
}

function CellEditor({ value, onChange, disabled }: { value: any; onChange: (v: any) => void; disabled?: boolean }) {
  const [local, setLocal] = useState<string>(() => (value ?? "") as any);
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  return (
    <input
      className="w-full rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
      value={String(local ?? "")}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onChange(local)}
      disabled={!!disabled}
    />
  );
}

function formatCell(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}
