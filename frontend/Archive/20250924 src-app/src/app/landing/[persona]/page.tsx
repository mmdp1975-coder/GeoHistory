// src/app/landing/[persona]/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseBrowserClient";

type Persona = "student" | "researcher" | "moderator" | "enthusiast" | "admin";
const allowed: Persona[] = ["student", "researcher", "moderator", "enthusiast", "admin"];

/* ---------------- THEME ---------------- */
const theme: Record<
  Persona,
  {
    bg: string;
    fg: string;
    accent: string;
    label: string;
    heroIcon: string;
    cards: { title: string; subtitle: string; href: string; img?: string; emoji?: string }[];
  }
> = {
  /* ---------- STUDENT: 6 widget quadrati ---------- */
  student: {
    bg: "#E6F7EE",
    fg: "#064E3B",
    accent: "#10B981",
    label: "Ciao!",
    heroIcon: "⭐",
    cards: [
      {
        title: "New Journeys",
        subtitle: "Latest stories added",
        href: "/explore?tab=journeys",
        img: "/images/landing/student/new-journeys.jpg",
        emoji: "🆕",
      },
      {
        title: "My J Favourites",
        subtitle: "Your saved picks",
        href: "/explore?tab=favorites",
        img: "/images/landing/student/favourites.jpg",
        emoji: "❤️",
      },
      {
        title: "My J Personal",
        subtitle: "Your custom space",
        href: "/explore",
        img: "/images/landing/student/personal.jpg",
        emoji: "📝",
      },
      {
        title: "Build your Journey",
        subtitle: "Create step by step",
        href: "/explore",
        img: "/images/landing/student/build.jpg",
        emoji: "🧩",
      },
      {
        title: "J Explorer",
        subtitle: "Discover maps & time",
        href: "/explore",
        img: "/images/landing/student/explorer.jpg",
        emoji: "🗺️",
      },
      {
        title: "Quiz",
        subtitle: "Test your knowledge",
        href: "/explore",
        img: "/images/landing/student/quiz.jpg",
        emoji: "❓",
      },
    ],
  },

  /* ---------- altre personas invariate ---------- */
  researcher: {
    bg: "#E6F0FF",
    fg: "#1E3A8A",
    accent: "#3B82F6",
    label: "Ciao!",
    heroIcon: "🧪",
    cards: [
      { title: "My Research", subtitle: "Accedi ai tuoi dati", href: "/dashboard/researcher" },
      { title: "Publications", subtitle: "Visualizza i tuoi articoli", href: "/dashboard/researcher?tab=pubs" },
      { title: "Projects", subtitle: "Gestisci i tuoi progetti", href: "/dashboard/researcher?tab=projects" },
      { title: "Collaborators", subtitle: "Trova ricercatori", href: "/dashboard/researcher?tab=people" },
    ],
  },
  enthusiast: {
    bg: "#F3E8FF",
    fg: "#5B21B6",
    accent: "#8B5CF6",
    label: "Ciao!",
    heroIcon: "🎓",
    cards: [
      { title: "My Journey", subtitle: "I tuoi group event", href: "/explore?tab=journeys" },
      { title: "Consigliati per te", subtitle: "Eventi su misura", href: "/explore?tab=recommended" },
      { title: "Domande veloci", subtitle: "Q&A rapidi", href: "/explore?tab=qa" },
      { title: "Community", subtitle: "Partecipa alla community", href: "/explore?tab=community" },
    ],
  },
  moderator: {
    bg: "#FFF7E6",
    fg: "#92400E",
    accent: "#F59E0B",
    label: "Ciao!",
    heroIcon: "🛡️",
    cards: [
      { title: "Queue", subtitle: "Contenuti da revisionare", href: "/moderation?tab=queue" },
      { title: "Rules", subtitle: "Linee guida & policy", href: "/moderation?tab=rules" },
      { title: "Projects", subtitle: "Progetti moderazione", href: "/moderation?tab=projects" },
      { title: "Reports", subtitle: "Segnalazioni", href: "/moderation?tab=reports" },
    ],
  },
  admin: {
    bg: "#FEE2E2",
    fg: "#7F1D1D",
    accent: "#EF4444",
    label: "Ciao!",
    heroIcon: "⚙️",
    cards: [
      { title: "Users", subtitle: "Gestisci utenti", href: "/dashboard/admin?tab=users" },
      { title: "Settings", subtitle: "Aggiorna le impostazioni", href: "/dashboard/admin?tab=settings" },
      { title: "Projects", subtitle: "Gestisci progetti", href: "/dashboard/admin?tab=projects" },
      { title: "Reports", subtitle: "Visualizza i report", href: "/dashboard/admin?tab=reports" },
      { title: "Explorer Map", subtitle: "Mappa con filtri (legacy)", href: "/explore" },
      {
        title: "Explore Journey",
        subtitle: "Gestisci i group events",
        href: "/admin/journeys",
        img: "/images/landing/admin/explore-journey.jpg",
        emoji: "🌍",
      },
    ],
  },
};

/* ---------------- COMPONENT ---------------- */
export default function PersonaLanding({ params }: { params: { persona: string } }) {
  const router = useRouter();
  const persona = (params.persona || "").toLowerCase() as Persona;
  const isValid = allowed.includes(persona);
  const t = isValid ? theme[persona] : theme.student;

  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const email = data?.session?.user?.email || "";
      const nameFromEmail = email ? email.split("@")[0] : "User";

      try {
        const uid = data?.session?.user?.id;
        if (uid) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, display_name")
            .eq("id", uid)
            .single();
          const display = (prof?.display_name || prof?.full_name || nameFromEmail) as string;
          setUserName(display);
        } else {
          setUserName(nameFromEmail);
        }
      } catch {
        setUserName(nameFromEmail);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isValid) router.replace("/landing/student");
  }, [isValid, router]);

  return (
    <main
      className="page"
      style={{
        ["--theme-bg" as any]: t.bg,
        ["--theme-fg" as any]: t.fg,
        ["--theme-accent" as any]: t.accent,
      } as React.CSSProperties}
    >
      {/* HEADER */}
      <header className="header">
        <div className="brand">
          <img src="/logo.png" alt="GeoHistory Journey" className="logo" />
        </div>

        <nav className="nav">
          <Link href="/profile" className="navlink">
            Impostazioni
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
            className="navbutton"
          >
            Logout
          </button>
        </nav>
      </header>

      {/* HERO */}
      <section className="hero" style={{ background: t.accent }}>
        <div className="hero-wrap">
          <div className="hero-icon" aria-hidden>
            {t.heroIcon}
          </div>
          <h1 className="hero-title">Ciao {userName}!</h1>
        </div>
      </section>

      {/* GRID */}
      <section className="grid-section">
        <div className="grid">
          {t.cards.map((c) => (
            <Link key={c.title} href={c.href} className="card" style={{ color: t.fg }}>
              <div className="card-media">
                {c.img ? (
                  <img
                    src={c.img}
                    alt={c.title}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}
                <div className="card-emoji" aria-hidden>
                  {c.emoji || "🗺️"}
                </div>
              </div>
              <div className="card-body">
                <div className="card-title">{c.title}</div>
                <div className="card-sub">{c.subtitle}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="footer">Help · About · Contatti</footer>

      {/* ====== STYLES ====== */}
      <style jsx>{`
        :global(html, body, #__next) {
          height: 100%;
        }
        .page {
          min-height: 100vh;
          background: var(--theme-bg);
          color: var(--theme-fg);
          display: flex;
          flex-direction: column;
          --header-h: 64px;
          --hero-h: 112px;
          --side-pad: 24px;
          --gap: 20px;
        }
        .header {
          height: var(--header-h);
          background: #fff;
          color: #111827;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--side-pad);
          border-bottom: 1px solid rgba(17, 24, 39, 0.08);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo {
          height: 36px;
        }
        .nav {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .navlink,
        .navbutton {
          text-decoration: underline;
          color: #111827;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          font: inherit;
        }

        .hero {
          height: var(--hero-h);
          color: white;
          display: flex;
          align-items: center;
        }
        .hero-wrap {
          max-width: 1060px;
          margin: 0 auto;
          padding: 0 var(--side-pad);
          display: flex;
          align-items: center;
          gap: 16px;
          width: 100%;
        }
        .hero-icon {
          width: 72px;
          height: 72px;
          border-radius: 36px;
          background: rgba(255, 255, 255, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
        }
        .hero-title {
          margin: 0;
          font-size: 40px;
          font-weight: 800;
        }

        .grid-section {
          flex: 1;
          padding: var(--side-pad);
          overflow: hidden;
        }
        .grid {
          max-width: 920px;
          margin: 0 auto;
          height: 100%;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-auto-rows: 1fr;
          gap: var(--gap);
          align-content: center;
        }

        .card {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.06);
          border: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
          aspect-ratio: 1 / 1;
        }
        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
        }

        .card-media {
          position: relative;
          width: 100%;
          height: 55%;
          background: linear-gradient(
            135deg,
            rgba(16, 185, 129, 0.08),
            rgba(16, 185, 129, 0.16)
          );
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-media img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .card-emoji {
          font-size: 56px;
          opacity: 0.9;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.18));
          z-index: 1;
        }

        .card-body {
          padding: 14px 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .card-title {
          font-size: 20px;
          font-weight: 800;
        }
        .card-sub {
          opacity: 0.8;
          line-height: 1.2;
        }

        .footer {
          padding: 12px var(--side-pad);
          opacity: 0.7;
          font-size: 12px;
          text-align: center;
        }

        @media (max-width: 1024px) {
          .grid {
            max-width: 760px;
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 920px) {
          .grid {
            max-width: 640px;
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 640px) {
          .grid {
            max-width: 520px;
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
