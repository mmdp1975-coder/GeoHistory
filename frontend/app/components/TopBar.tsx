// frontend/app/components/TopBar.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Home, ArrowLeft, Settings as SettingsIcon, LogOut } from 'lucide-react';

type ProfileRow = {
  id: string;
  language_code: string | null;
  persona_id: string | null;
};

export default function TopBar() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  // Home dinamica → /landing/{persona_code}
  const [homeHref, setHomeHref] = useState<string | null>(null);
  const [loadingHome, setLoadingHome] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingHome(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !alive) {
          setHomeHref('/landing');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, language_code, persona_id')
          .eq('id', user.id)
          .single<ProfileRow>();

        if (!profile?.persona_id) {
          setHomeHref('/landing');
          return;
        }

        const { data: persona } = await supabase
          .from('personas')
          .select('code')
          .eq('id', profile.persona_id)
          .single<{ code: string | null }>();

        const code = persona?.code?.trim() || null;
        setHomeHref(code ? `/landing/${code}` : '/landing');
      } catch {
        setHomeHref('/landing');
      } finally {
        if (alive) setLoadingHome(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally { router.push('/login'); }
  }

  function goHome() {
    if (!homeHref) return; // evita fallback precoce
    router.push(homeHref);
  }

  return (
    <nav className="sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
        {/* Logo a sinistra — più grande e proporzionato */}
        <Link href="/" aria-label="GeoHistory Journey" className="flex items-center">
          {/* width/height richiesti da next/image; la classe regola l'altezza reale */}
          <Image
            src="/logo.png"
            alt="GeoHistory Journey"
            width={300}
            height={80}
            priority
            className="h-10 md:h-12 w-auto"
          />
        </Link>

        {/* Menu a destra — solo icone su mobile, icona+testo da md+ */}
        <div className="flex items-center gap-4 md:gap-6 text-sm md:text-base">
          {/* Home dinamica */}
          <button
            onClick={goHome}
            disabled={loadingHome || !homeHref}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 disabled:opacity-50"
            type="button"
            aria-label="Home"
            title={loadingHome ? 'Loading…' : 'Home'}
          >
            <Home className="w-5 h-5" />
            <span className="hidden md:inline">Home</span>
          </button>

          {/* Back */}
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
            type="button"
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden md:inline">Back</span>
          </button>

          {/* Settings */}
          <Link
            href="/module/settings"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="hidden md:inline">Settings</span>
          </Link>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
            type="button"
            aria-label="Logout"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
