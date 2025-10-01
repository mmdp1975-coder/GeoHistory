// app/logout/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../lib/supabaseBrowserClient";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        router.replace("/login");
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center">
      <p>Logging out…</p>
    </main>
  );
}
