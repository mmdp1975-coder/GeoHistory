// src/app/landing/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseBrowserClient";
import LandingHeader from "../../components/landing/common/LandingHeader";

export default function LandingRouterPage() {
  const [msg, setMsg] = useState("Preparazione pagina…");

  useEffect(() => {
    const go = async () => {
      setMsg("Verifica utente…");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setMsg("Carico profilo…");
      const { data: prof } = await supabase
        .from("profiles")
        .select("personas(code, default_landing_path)")
        .eq("id", user.id)
        .single();

      if (!prof?.personas?.code) {
        window.location.href = "/profile";
        return;
      }

      const code = prof.personas.code as string;
      const target = prof.personas.default_landing_path ?? `/landing/${code}`;
      window.location.href = target;
    };

    go();
  }, []);

  return (
    <div>
      <LandingHeader title="Redirect alla tua landing…" />
      <div className="p-6">{msg}</div>
    </div>
  );
}
