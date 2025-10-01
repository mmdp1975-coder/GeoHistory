// src/app/admin/journeys/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseBrowserClient";

type JourneyRow = Record<string, any> & { id: string };
type EditBuffer = Record<string, any>;

const COLUMNS_PREFERENCE: { key: string; label: string; type: "text" | "number" | "boolean" }[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "slug", label: "Slug", type: "text" },
  { key: "visibility", label: "Visibility", type: "text" },
  { key: "status", label: "Status", type: "text" },
  { key: "is_published", label: "Published", type: "boolean" },
  { key: "is_featured", label: "Featured", type: "boolean" },
  { key: "start_year", label: "Start Year", type: "number" },
  { key: "end_year", label: "End Year", type: "number" },
];

function guessType(value: any): "text" | "number" | "boolean" {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "text";
}

export default function AdminJourneysPage() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<JourneyRow[]>([]);
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState<Record<string, EditBuffer>>({});

  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("group_events")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1000);
        if (error) throw error;

        const normalized = (data ?? []).map((r: any) => ({ ...r, id: String(r.id) }));
        setRows(normalized);
      } catch (e: any) {
        setError(e?.message ?? "Unknown error loading group_events");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const presentColumns = useMemo(() => {
    if (rows.length === 0) return [];
    const sample = rows[0];
    const presentKeys = Object.keys(sample);
    const preferred = COLUMNS_PREFERENCE.filter((c) => presentKeys.includes(c.key));

    const ignored = new Set([
      "id","created_at","updated_at","inserted_at","deleted_at",
      "owner_id","author_id","created_by","updated_by","geom","geometry",
    ]);

    const extras = presentKeys
      .filter((k) => !ignored.has(k) && !preferred.find((c) => c.key === k))
      .map((k) => ({
        key: k,
        label: k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        type: guessType(sample[k]),
      }));

    return [...preferred, ...extras];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(f));
  }, [rows, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const handleChange = (id: string, key: string, val: any) => {
    setEdit((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: val } }));
  };
  const hasChanges = (id: string) => !!edit[id] && Object.keys(edit[id]).length > 0;

  const handleSave = async (id: string) => {
    const changes = edit[id];
    if (!changes || Object.keys(changes).length === 0) return;

    setSavingId(id);
    setError(null);
    try {
      const { error } = await supabase.from("group_events").update(changes).eq("id", id);
      if (error) throw error;

      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes, updated_at: new Date().toISOString() } : r)));
      setEdit((prev) => { const { [id]: _discard, ...rest } = prev; return rest; });
    } catch (e: any) {
      setError(e?.message ?? "Unknown error saving");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Explore Journey — Admin</h1>
          <span className="text-sm text-gray-500">Manage & edit Group Events</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/landing/admin" className="text-sm text-blue-600 hover:underline">← Back to Admin</Link>
        </div>
      </header>

      <main className="px-6 py-5">
        <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search in all fields..."
              className="w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500">{filteredRows.length} results</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-100" onClick={() => { setFilter(""); setPage(1); }}>
              Reset filters
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-600">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
            Loading group_events…
          </div>
        ) : (
          <>
            <div className="overflow-auto rounded-xl border bg-white">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-600 font-medium w-[260px]">ID</th>
                    {presentColumns.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-left text-gray-600 font-medium">{c.label}</th>
                    ))}
                    <th className="px-3 py-2 text-right text-gray-600 font-medium w-[160px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.id}</td>

                      {presentColumns.map((c) => {
                        const current = (edit[row.id]?.[c.key] ?? row[c.key]) as any;

                        if (c.type === "boolean") {
                          const checked = Boolean(current);
                          return (
                            <td key={c.key} className="px-3 py-2">
                              <input type="checkbox" className="h-4 w-4" checked={checked}
                                onChange={(e) => handleChange(row.id, c.key, e.target.checked)} />
                            </td>
                          );
                        }

                        if (c.type === "number") {
                          return (
                            <td key={c.key} className="px-3 py-2">
                              <input type="number" value={current ?? ""}
                                onChange={(e) => handleChange(row.id, c.key, e.target.value === "" ? null : Number(e.target.value))}
                                className="w-40 rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </td>
                          );
                        }

                        return (
                          <td key={c.key} className="px-3 py-2">
                            <input type="text" value={current ?? ""} onChange={(e) => handleChange(row.id, c.key, e.target.value)}
                              className="w-64 rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </td>
                        );
                      })}

                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/admin/journeys/${row.id}`} className="rounded-md border px-2 py-1 hover:bg-gray-100">Open</Link>
                          <button onClick={() => handleSave(row.id)} disabled={savingId === row.id || !hasChanges(row.id)}
                            className={`rounded-md px-3 py-1 text-white ${savingId === row.id || !hasChanges(row.id) ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
                            {savingId === row.id ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={presentColumns.length + 2} className="px-3 py-8 text-center text-gray-500">
                        No results
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-gray-500">Page {page} / {totalPages}</div>
              <div className="flex items-center gap-2">
                <button className="rounded-md border px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
                <button className="rounded-md border px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
