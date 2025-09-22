// src/components/landing/common/LandingHeader.tsx
"use client";

import { supabase } from "../../../lib/supabaseBrowserClient";
import { useEffect, useState } from "react";

type Props = { title?: string };

export default function LandingHeader({ title }: Props) {
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    };
    load();
  }, []);

  const onSignOut = async () => {
    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      window.location.href = "/login";
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="GeoHistory Journey" className="h-8 w-8 object-contain" />
          <span className="font-extrabold tracking-tight">
            GeoHistory <span className="font-black">Journey</span>
          </span>
        </a>
        {title && <div className="ml-2 text-sm text-gray-600 truncate">{title}</div>}
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          {email && <span className="hidden sm:inline text-sm text-gray-600">{email}</span>}
          <button
            onClick={onSignOut}
            disabled={signingOut}
            className="px-3 py-1.5 rounded bg-black text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {signingOut ? "Sign-off…" : "Sign-off"}
          </button>
        </div>
      </div>
    </header>
  );
}

