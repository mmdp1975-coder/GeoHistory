"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseBrowserClient";

type PersonaRow =
  | { slug?: string | null; default_landing_path?: string | null }
  | null
  | undefined;

export default function HomeRedirectPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Verifica sessione…");

  useEffect(() => {
    const run = async () => {
      // 1) sessione
      const { data: auth } = await supabase.auth.getSession();
      const session = auth?.session;
      if (!session) {
        setMsg("Nessuna sessione. Vai al login…");
        router.replace("/login");
        return;
      }

      // 2) profilo + persona (join)
      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
          email,
          persona_id,
          personas:persona_id (
            slug,
            default_landing_path
          )
        `
        )
        .eq("id", session.user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(error);
        setMsg("Errore nel caricamento profilo.");
        return;
      }

      const persona: PersonaRow = Array.isArray((data as any)?.personas)
        ? (data as any)?.personas?.[0]
        : (data as any)?.personas;

      const slug = (persona?.slug ?? "").toString();

      // 3) path di destinazione
      let dest = (persona?.default_landing_path ?? "").toString();

      // fallback per gli slug che usiamo nei test
      if (!dest) {
        const bySlug: Record<string, string> = {
          admin: "/admin",
          moderator: "/moderation",
          researcher: "/research",
          appassionato: "/fan",
          student_primary: "/students/primary",
          student_middle: "/students/middle",
          student_high: "/students/high",
        };
        
        dest = bySlug[slug] || "/";
      }

      setMsg(`Persona: ${slug || "sconosciuta"} → ${dest}`);
      router.replace(dest);
    };

    run();
  }, [router]);

  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">/home</h1>
      <p className="mt-2">{msg}</p>
    </main>
  );
}
