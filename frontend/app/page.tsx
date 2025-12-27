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

      // landing unica: evita rotte persona obsolete (/landing/<code>)
      router.replace("/module/landing");
    })();
  }, [router, supabase]);

  return null;
}
