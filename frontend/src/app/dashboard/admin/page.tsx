// src/app/dashboard/admin/page.tsx
"use client";

import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";

export default function AdminDashboard() {
  return (
    <DashboardShell role="admin" showOldMap>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card href="/admin/users" title="Users" desc="Gestisci utenti" />
        <Card href="/admin/settings" title="Settings" desc="Aggiorna le impostazioni" />
        <Card href="/admin/projects" title="Projects" desc="Gestisci progetti" />
        <Card href="/admin/reports" title="Reports" desc="Visualizza i report" />
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
