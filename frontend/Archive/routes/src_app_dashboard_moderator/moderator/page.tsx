// src/app/dashboard/moderator/page.tsx
"use client";

import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";

export default function ModeratorDashboard() {
  return (
    <DashboardShell role="moderator">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card href="/moderation/review" title="Review Queue" desc="Elementi in attesa di approvazione" />
        <Card href="/moderation/flags" title="Flags" desc="Segnalazioni e contenuti sensibili" />
        <Card href="/moderation/users" title="Users" desc="Gestione utenti in moderazione" />
        <Card href="/moderation/reports" title="Reports" desc="Statistiche e log attività" />
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
