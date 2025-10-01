// src/app/admin/journeys/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseBrowserClient";

export default function JourneyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [row, setRow] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.from("group_events").select("*").eq("id", id).single();
        if (error) throw error;
        setRow(data);
      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Journey Detail</h1>
          <span className="text-sm text-gray-500">ID: {id}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/journeys" className="text-sm text-blue-600 hover:underline">← Back to list</Link>
        </div>
      </header>

      <main className="px-6 py-5">
        {loading ? (
          <div className="text-gray-600">Loading…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : !row ? (
          <div className="text-gray-500">Not found</div>
        ) : (
          <pre className="rounded-xl border bg-white p-4 text-sm overflow-auto">{JSON.stringify(row, null, 2)}</pre>
        )}
      </main>
    </div>
  );
}
