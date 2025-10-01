// src/app/landing/page.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowserClient";

type PersonaInfo = { default_landing_path: string | null; code: string | null };
type ProfileWithPersona = { personas: PersonaInfo | null };

function toPersonaLanding(personaCode?: string | null, dbPath?: string | null) {
  const code = (personaCode || "").toLowerCase();
  const p = (dbPath || "").trim().toLowerCase();

  if (p.startsWith("/landing/")) return p;
  if (p === "/student/home" || p.startsWith("/student/") || p === "/dashboard/student") return "/landing/student";
  if (p === "/fan" || p === "/dashboard/enthusiast") return "/landing/enthusiast";
  if (p === "/research" || p === "/dashboard/researcher") return "/landing/researcher";
  if (p === "/dashboard/moderator") return "/landing/moderator";
  if (p === "/dashboard/admin") return "/landing/admin";

  switch (code) {
    case "student":     return "/landing/student";
    case "researcher":  return "/landing/researcher";
    case "moderator":   return "/landing/moderator";
    case "enthusiast":  return "/landing/enthusiast";
    case "admin":       return "/landing/admin";
    default:            return "/landing/student";
  }
}

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;
      if (!user) return; // utente non loggato: mostra landing pubblica

      const { data, error } = await supabase
        .from("profiles")
        .select("personas(default_landing_path, code)")
        .eq("id", user.id)
        .single();

      if (!error) {
        const persona = (data as ProfileWithPersona | null)?.personas ?? null;
        const target = toPersonaLanding(persona?.code ?? null, persona?.default_landing_path ?? null);
        router.replace(target);
      } else {
        router.replace("/landing/student"); // fallback forte
      }
    })();
  }, [router]);

  return (
    <main style={{minHeight:"70vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:24,textAlign:"center"}}>
      <img src="/logo.png" alt="GeoHistory Journey" style={{height:40, marginBottom:8}} />
      <h1 style={{margin:0}}>GeoHistory Journey</h1>
      <p style={{maxWidth:680, lineHeight:1.4}}>
        Explore maps, travel through timelines, and bring events to life.
      </p>
      <p>
        <Link href="/explore">Go to Explore</Link>{" · "}
        <Link href="/login">Login</Link>
      </p>
    </main>
  );
}
