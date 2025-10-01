"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowserClient";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const doLogout = async () => {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        router.replace("/login");
      }
    };
    doLogout();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Logging out…</p>
    </div>
  );
}
