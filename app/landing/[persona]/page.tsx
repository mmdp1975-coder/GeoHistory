// app/landing/[persona]/page.tsx
import Link from "next/link";
import { fetchWidgetsForPersona } from "@/lib/widgets";

export default async function PersonaLandingPage({ params }: { params: { persona: string } }) {
  const persona = (params?.persona || "").toLowerCase();
  const widgets = await fetchWidgetsForPersona(persona);

  return (
    <main className="min-h-screen">
      <section className="px-6 py-8 border-b">
        <h1 className="text-2xl font-bold">Landing — {persona}</h1>
        <p className="text-gray-600">Widget attivi per questa persona (da Supabase).</p>
      </section>

      <section className="p-6">
        {widgets.length === 0 ? (
          <div className="text-gray-600">Nessun widget configurato per <b>{persona}</b>.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map((w) => (
              <Link
                key={w.widget_id}
                href={w.route}
                className="bg-white border rounded-xl p-4 hover:shadow transition"
              >
                <div className="text-3xl">{w.icon ?? "🧭"}</div>
                <div className="mt-2 font-bold">{w.title}</div>
                {w.description && <div className="text-sm text-gray-600">{w.description}</div>}
                <div className="mt-2 text-xs text-gray-400">{w.key}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
