// src/app/dashboard/researcher/page.tsx
"use client";

import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";

export default function ResearcherDashboard() {
  return (
    <DashboardShell role="researcher">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card href="/research" title="My Research" desc="Accedi ai tuoi dati" />
        <Card href="/publications" title="Publications" desc="Visualizza i tuoi articoli" />
        <Card href="/projects" title="Projects" desc="Gestisci i tuoi progetti" />
        <Card href="/collaborators" title="Collaborators" desc="Trova ricercatori" />
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
