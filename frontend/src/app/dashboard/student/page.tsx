// src/app/dashboard/student/page.tsx
"use client";

import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";

export default function StudentDashboard() {
  return (
    <DashboardShell role="student">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card href="/journeys/mine" title="My Journey" desc="I tuoi group event" />
        <Card href="/discover/recommended" title="Consigliati per te" desc="Eventi su misura per te" />
        <Card href="/qa" title="Domande veloci" desc="Vai alle domande e risposte" />
        <Card href="/learn" title="Impara" desc="Percorsi guidati per studenti" />
      </div>
    </DashboardShell>
  );
}

function Card({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="block rounded-xl bg-white p-5 shadow hover:shadow-md border border-neutral-200">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-neutral-600 mt-1">{desc}</p>
    </Link>
  );
}
