// src/app/dashboard/enthusiast/page.tsx
"use client";

import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";

export default function EnthusiastDashboard() {
  return (
    <DashboardShell role="enthusiast">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card href="/favorites" title="My Interests" desc="Visualizza i tuoi preferiti" />
        <Card href="/videos" title="Videos" desc="Guarda i video" />
        <Card href="/topics" title="Topics" desc="Esplora gli argomenti" />
        <Card href="/discussions" title="Discussions" desc="Unisciti alle conversazioni" />
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
