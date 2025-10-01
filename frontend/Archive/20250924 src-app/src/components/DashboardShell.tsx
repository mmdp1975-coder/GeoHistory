// src/components/DashboardShell.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RoleBadge from "./RoleBadge";
import { supabase } from "@/lib/supabaseClient";

type Role = "student" | "researcher" | "enthusiast" | "moderator" | "admin";

type Props = {
  role: Role;
  children: React.ReactNode;
  showOldMap?: boolean; // solo Admin
};

type Profile = {
  id: string;
  role: Role;
  full_name?: string | null;
  first_name?: string | null;
};

export default function DashboardShell({ role, children, showOldMap }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, full_name, first_name")
        .eq("id", user.id)
        .single();
      if (!error && data) setProfile(data);
    })();
  }, [router]);

  const displayName =
    profile?.first_name ||
    profile?.full_name?.split(" ")?.[0] ||
    "Utente";

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-semibold tracking-tight">
              LOGO
            </Link>
            <RoleBadge role={role} />
          </div>
          <nav className="flex items-center gap-3">
            {/* Solo Admin → Old Map */}
            {showOldMap && (
              <Link
                href="/explorer/old-map"
                className="px-3 py-1.5 rounded-md bg-indigo-700 text-white hover:bg-indigo-800"
              >
                Old Map
              </Link>
            )}
            <Link
              href="/settings"
              className="px-3 py-1.5 rounded-md border border-neutral-300 hover:bg-neutral-100"
            >
              Impostazioni
            </Link>
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-md border border-neutral-300 hover:bg-neutral-100"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      {/* Greeting banner (colore per ruolo) */}
      <section
        className={[
          "border-b border-neutral-200",
          role === "student" ? "bg-emerald-600" :
          role === "researcher" ? "bg-blue-600" :
          role === "enthusiast" ? "bg-amber-500" :
          role === "moderator" ? "bg-slate-600" :
          "bg-indigo-900"
        ].join(" ")}
      >
        <div className="mx-auto max-w-6xl px-4 py-8 text-white flex items-center justify-between">
          <h1 className="text-3xl font-bold">👋 Ciao {displayName}!</h1>
        </div>
      </section>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      {/* Footer */}
      <footer className="border-t border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-neutral-500 flex gap-6">
          <Link href="/help">Help</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contatti</Link>
        </div>
      </footer>
    </div>
  );
}
