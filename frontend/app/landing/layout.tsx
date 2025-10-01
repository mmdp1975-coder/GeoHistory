// app/landing/layout.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    try {
      // ⬇️ Se la tua endpoint è diversa, sostituisci "/api/logout"
      await fetch("/api/logout", { method: "POST" });
    } catch {
      /* ignora errori di rete: in fallback redirigiamo comunque */
    } finally {
      router.push("/login");
    }
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      {/* TOP BAR COMUNE (tutte le landing) */}
      <nav className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
          {/* LOGO ben visibile a sinistra */}
          <Link href="/" aria-label="GeoHistory Home" className="flex items-center gap-3">
            <Image src="/logo.png" alt="GeoHistory" width={150} height={150} priority />
          </Link>

          {/* Solo Impostazioni + Logout */}
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/settings" // ⬅️ cambia qui se la tua rotta impostazioni è diversa
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
              aria-label="Impostazioni"
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path
                  d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm8.94 4a7 7 0 0 0-.23-1.76l2.06-1.6-1.5-2.6-2.48.76a7 7 0 0 0-1.52-.88L16.8 2h-3.6l-.47 2.92c-.53.2-1.04.48-1.52.82l-2.5-.77-1.5 2.6 2.06 1.6c-.1.57-.16 1.16-.16 1.76s.06 1.19.17 1.76l-2.07 1.6 1.5 2.6 2.49-.77c.47.34.98.61 1.52.82L13.2 22h3.6l.47-2.92c.53-.2 1.04-.48 1.52-.82l2.49.77 1.5-2.6-2.06-1.6c.1-.57.16-1.16.16-1.76z"
                  fill="currentColor"
                />
              </svg>
              Impostazioni
            </Link>

            <button
              onClick={handleLogout}
              className="text-slate-600 hover:text-slate-900"
              aria-label="Logout"
              type="button"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* CONTENUTO DELLE LANDING */}
      {children}
    </div>
  );
}
