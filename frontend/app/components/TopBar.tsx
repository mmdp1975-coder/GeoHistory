// frontend/app/components/TopBar.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Home, ArrowLeft, Settings as SettingsIcon, LogOut } from 'lucide-react';

export default function TopBar() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.push('/login');
    }
  }

  function goHome() {
    router.push('/module/landing'); // 🔹 ora punta sempre alla landing principale
  }

  return (
    <nav className="sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
        {/* Logo a sinistra */}
        <Link href="/" aria-label="GeoHistory Journey" className="flex items-center">
          <Image
            src="/logo.png"
            alt="GeoHistory Journey"
            width={300}
            height={80}
            priority
            className="h-10 md:h-12 w-auto"
          />
        </Link>

        {/* Menu a destra */}
        <div className="flex items-center gap-4 md:gap-6 text-sm md:text-base">
          {/* Home fissa su /module/landing */}
          <button
            onClick={goHome}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
            type="button"
            aria-label="Home"
            title="Home"
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
