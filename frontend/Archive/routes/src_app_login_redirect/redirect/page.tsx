// src/app/login/redirect/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function RedirectAfterLogin() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || !profile?.role) {
        router.replace("/login");
        return;
      }

      const role = profile.role as
        | "student" | "researcher" | "enthusiast" | "moderator" | "admin";

      const target =
        role === "student" ? "/dashboard/student" :
        role === "researcher" ? "/dashboard/researcher" :
        role === "enthusiast" ? "/dashboard/enthusiast" :
        role === "moderator" ? "/dashboard/moderator" :
        "/dashboard/admin";

      router.replace(target);
    })();
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center text-neutral-600">
      Reindirizzamento in corso…
    </div>
  );
}
