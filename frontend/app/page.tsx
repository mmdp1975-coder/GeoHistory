// frontend/app/page.tsx
'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function RootPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      // leggo persona_id dal profilo
      const { data: profile } = await supabase
        .from("profiles")
        .select("persona_id")
        .eq("id", user.id)
        .single<{ persona_id: string | null }>();

      let href = "/landing/FAN"; // fallback sicuro

      if (profile?.persona_id) {
        const { data: persona } = await supabase
          .from("personas")
          .select("code")
          .eq("id", profile.persona_id)
          .single<{ code: string | null }>();

        const code = persona?.code?.trim();
        if (code) href = `/landing/${code}`;
      }

      router.replace(href);
    })();
  }, [router, supabase]);

  return null;
}
