"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type TableMetaCol = { column_name: string; data_type: string };
type TableMeta = { table: string; columns: TableMetaCol[] };

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_TOKEN || "";
const devHeaders: Record<string, string> = DEV_BYPASS ? { "x-dev-bypass": DEV_BYPASS } : ({} as Record<string, string>);

export default function DBManagerPage() {
  // NON usiamo piÃ¹ onTokenChange: teniamo un token â€œvuotoâ€ e
  // lasciamo che sia il DEV_BYPASS ad autorizzare le chiamate.
  const [token] = useState<string | null>("");

  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesErr, setTablesErr] = useState<string | null>(null);

  const [table, setTable] = useState<string>("");

  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  const [rows, setRows] = useState<any[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsErr, setRowsErr] = useState<string | null>(null);
  const [page] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const [editing, setEditing] = useState<
    | { mode: "none" }
    | { mode: "edit"; id: string; original: any; values: Record<string, any> }
    | { mode: "create"; values: Record<string, any> }
  >({ mode: "none" });
  const [opMsg, setOpMsg] = useState<string | null>(null);

  async function safeJson(res: Response) {
    const txt = await res.text();
    if (!txt) return res.ok ? {} : { error: `HTTP ${res.status}` };
    try { return JSON.parse(txt); } catch { return { error: txt }; }
  }

  // Load tables
  useEffect(() => {
    // se non hai DEV_BYPASS e non gestisci token, non partire
    if (!DEV_BYPASS && !token) return;
    (async () => {
      try {
        setTablesLoading(true); setTablesErr(null);
        const res = await fetch("/api/admin/tables", {
          cache: "no-store",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...devHeaders,
          } as HeadersInit,
        });
        const j: any = await safeJson(res);
        if (!res.ok) throw new Error(j?.error || "Failed loading tables");
        const list: string[] = Array.isArray(j.tables) ? j.tables : [];
        setTables(list);
        if (!table && list.length) setTable(list[0]);
      } catch (e: any) {
        setTablesErr(e?.message ?? "Tables load error"); setTables([]);
      } finally {
        setTablesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load meta + rows
  useEffect(() => {
    if ((!DEV_BYPASS && !token) || !table) return;

    (async () => {
      try {
        setMetaLoading(true); setMetaErr(null);
        const res = await fetch(`/api/admin/tables/${encodeURIComponent(table)}/meta`, {
          cache: "no-store",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...devHeaders,
          } as HeadersInit,
        });
        const j: any = await safeJson(res);
        if (!res.ok) throw new Error(j?.error || "Failed loading meta");
        setMeta({ table: j.table || table, columns: Array.isArray(j.columns) ? j.columns : [] });
      } catch (e: any) {
        setMetaErr(e?.message ?? "Meta load error");
        setMeta({ table, columns: [] });
      } finally {
        setMetaLoading(false);
      }
    })();

    (async () => {
      try {
        setRowsLoading(true); setRowsErr(null);
        const qs = new URLSearchParams({ page: String(1), pageSize: String(pageSize) }).toString();
        const res = await fetch(`/api/admin/tables/${encodeURIComponent(table)}?${qs}`, {
          cache: "no-store",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...devHeaders,
          } as HeadersInit,
        });
        const j: any = await safeJson(res);
        if (!res.ok) throw new Error(j?.error || "Failed loading rows");
        setRows(Array.isArray(j.rows) ? j.rows : []);
        setTotal(Number(j.total || 0));
      } catch (e: any) {
        setRowsErr(e?.message ?? "Rows load error");
        setRows([]); setTotal(0);
      } finally {
        setRowsLoading(false);
      }
    })();
  }, [table, token, pageSize]);

  const columns = useMemo(() => {
    const metaCols = meta?.columns?.map((c) => c.column_name) ?? [];
    if (metaCols.length > 0) return metaCols;
    const keys = new Set<string>();
    for (const r of rows.slice(0, 50)) Object.keys(r || {}).forEach((k) => keys.add(k));
    return Array.from(keys);
  }, [meta, rows]);

  const primaryKey = useMemo(() => (columns.includes("id") ? "id" : null), [columns]);

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
    if (primaryKey) delete blank[primaryKey];
    setEditing({ mode: "create", values: blank });
    setOpMsg(null);
  };
  const cancelEdit = () => setEditing({ mode: "none" });
  const onFieldChange = (col: string, v: any) => {
    setEditing((prev) => (prev.mode === "none" ? prev : { ...prev, values: { ...prev.values, [col]: v } } as any));
  };

  const refreshRows = async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }).toString();
    const r = await fetch(`/api/admin/tables/${encodeURIComponent(table)}?${qs}`, {
      cache: "no-store",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...devHeaders,
          } as HeadersInit,
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok) {
      setRows(Array.isArray(j.rows) ? j.rows : []);
      setTotal(Number(j.total || 0));
    }
  };

  const saveEdit = async () => {
    try {
      if (editing.mode === "edit") {
        const id = editing.id;
        const res = await fetch(`/api/admin/tables/${encodeURIComponent(table)}/rows/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...devHeaders,
          } as HeadersInit,
          body: JSON.stringify(editing.values),
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Update failed");
        setOpMsg(`Updated ${(json.updated?.length ?? 0)} row(s).`);
      } else if (editing.mode === "create") {
        const res = await fetch(`/api/admin/tables/${encodeURIComponent(table)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...devHeaders,
          } as HeadersInit,
          body: JSON.stringify(editing.values),
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Insert failed");
        setOpMsg(`Inserted ${(json.inserted?.length ?? 0)} row(s).`);
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
      const res = await fetch(`/api/admin/tables/${encodeURIComponent(table)}/rows/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...devHeaders,
          } as HeadersInit,
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      setOpMsg(`Deleted ${(json.deleted?.length ?? 0)} row(s).`);
      await refreshRows();
    } catch (e: any) {
      setOpMsg(e?.message ?? "Delete error");
    }
  };

  const totalPages = useMemo(() => (total ? Math.max(1, Math.ceil(total / pageSize)) : 1), [total, pageSize]);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">DB Manager</h1>
        <div className="ml-auto flex gap-2">
          <Link href="/module/DB_Manager/journey_edit" className="rounded-lg border px-3 py-2 text-sm">Journey {'->'}</Link>
          <Link href="/module/DB_Manager/users_edit" className="rounded-lg border px-3 py-2 text-sm">Users {'->'}</Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">Table</label>
        <select
          className="rounded-lg border px-3 py-2 text-sm"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          disabled={tablesLoading || !tables.length}
        >
          {!tables.length && <option value="">â€”</option>}
          {tables.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {tablesLoading && <span className="text-sm text-slate-500">loadingâ€¦</span>}
        {tablesErr && <span className="text-sm text-red-600">{tablesErr}</span>}

        <button className="ml-auto rounded-lg border px-3 py-2 text-sm" onClick={startCreate} disabled={!columns.length}>
          + Add row
        </button>
      </div>

      {metaLoading && <p className="text-sm text-slate-500 mt-2">loading metaâ€¦</p>}
      {metaErr && <p className="text-sm text-red-600 mt-2">{metaErr}</p>}

      {opMsg && <div className="mt-3 rounded border bg-slate-50 p-2 text-xs">{opMsg}</div>}

      <div className="mt-4 overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left border-b">Actions</th>
              {columns.map((c) => <th key={c} className="px-3 py-2 text-left border-b">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rowsLoading ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={columns.length + 1}>loading rowsâ€¦</td></tr>
            ) : rowsErr ? (
              <tr><td className="px-3 py-3 text-red-600" colSpan={columns.length + 1}>{rowsErr}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={columns.length + 1}>Nessun record</td></tr>
            ) : (
              rows.map((r, idx) => {
                const pk = primaryKey ? String(r[primaryKey]) : String(idx);
                const isEdit = editing.mode === "edit" && editing.id === pk;
                return (
                  <tr key={pk} className="odd:bg-white even:bg-slate-50">
                    <td className="px-2 py-2 border-b">
                      {isEdit ? (
                        <div className="flex gap-2">
                          <button className="rounded border px-2 py-1" onClick={saveEdit}>Save</button>
                          <button className="rounded border px-2 py-1" onClick={cancelEdit}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button className="rounded border px-2 py-1" onClick={() => startEdit(r)} disabled={!primaryKey}>Edit</button>
                          <button className="rounded border px-2 py-1 text-red-700" onClick={() => deleteRow(r)} disabled={!primaryKey}>Delete</button>
                        </div>
                      )}
                    </td>
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-2 border-b">{formatCell(r?.[c])}</td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="text-slate-600">Page {page} / {totalPages} Â· {total} rows</span>
      </div>
    </div>
  );
}

function formatCell(v: any) {
  if (v === null || v === undefined) return "â€”";
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

















