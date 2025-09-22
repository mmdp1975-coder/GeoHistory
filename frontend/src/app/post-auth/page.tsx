// src/app/post-auth/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseBrowserClient";

export default function PostAuthPage() {
  const [msg, setMsg] = useState("Verifica sessione…");

  useEffect(() => {
    const go = async () => {
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
        .select("personas(default_landing_path, code)")
        .eq("id", user.id)
        .single();

      const path =
        prof?.personas?.default_landing_path ??
        (prof?.personas?.code ? `/landing/${prof.personas.code}` : "/profile");

      window.location.href = path;
    };
    go();
  }, []);

  return <div className="p-6">Accesso effettuato. {msg}</div>;
}
