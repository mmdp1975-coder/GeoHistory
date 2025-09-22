// src/app/landing/[persona]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseBrowserClient";
import landingConfig from "../../../config/persona-landing.config.json";

import LandingHeader from "../../../components/landing/common/LandingHeader";
import SectionImpostazioni from "../../../components/landing/sections/SectionImpostazioni";
import SectionSceltaIniziale from "../../../components/landing/sections/SectionSceltaIniziale";
import SectionOrientamento from "../../../components/landing/sections/SectionOrientamento";
import SectionEventoSingolo from "../../../components/landing/sections/SectionEventoSingolo";
import SectionCuriosita from "../../../components/landing/sections/SectionCuriosita";
import SectionRaccolta from "../../../components/landing/sections/SectionRaccolta";
import SectionCreazione from "../../../components/landing/sections/SectionCreazione";
import SectionFollowup from "../../../components/landing/sections/SectionFollowup";

type PersonaConfig = {
  label_it: string;
  sub_levels?: Record<string, any>;
  sections: Record<string, any>;
};

type PageProps = { params: { persona: string } };

export default function PersonaLandingPage({ params }: PageProps) {
  const requestedCode = params.persona as
    | "student"
    | "enthusiast"
    | "researcher"
    | "moderator"
    | "admin";

  const [loading, setLoading] = useState(true);
  const [subLevel, setSubLevel] = useState<string | null>(null);
  const [personaCode, setPersonaCode] = useState<string | null>(null);
  const [personaConfig, setPersonaConfig] = useState<PersonaConfig | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("persona_id, personas(code, sub_level, default_landing_path)")
        .eq("id", user.id)
        .single();

      if (!prof?.personas?.code) {
        window.location.href = "/profile";
        return;
      }

      const actualCode = prof.personas.code as string;
      const actualSub = (prof.personas.sub_level as string) ?? null;

      if (requestedCode !== actualCode) {
        const target =
          prof.personas.default_landing_path ?? `/landing/${actualCode}`;
        window.location.href = target;
        return;
      }

      const cfg = (landingConfig as any).personas?.[actualCode] as
        | PersonaConfig
        | undefined;

      setPersonaCode(actualCode);
      setSubLevel(actualSub);
      setPersonaConfig(cfg ?? null);
      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCode]);

  if (loading) return <div className="p-6">Caricamento pagina persona…</div>;
  if (!personaConfig)
    return <div className="p-6">Configurazione persona non trovata.</div>;

  const renderSection = (key: string, section: any) => {
    switch (key) {
      case "scelta_iniziale":
        return <SectionSceltaIniziale key={key} config={section as string[]} />;
      case "orientamento":
        return <SectionOrientamento key={key} config={section} />;
      case "evento_singolo":
        return <SectionEventoSingolo key={key} config={section} />;
      case "curiosita":
        return <SectionCuriosita key={key} config={section} />;
      case "raccolta":
        return <SectionRaccolta key={key} config={section} />;
      case "creazione":
        return <SectionCreazione key={key} config={section} />;
      case "followup":
        return <SectionFollowup key={key} config={section} />;
      default:
        return (
          <div key={key} className="p-4 border rounded-lg bg-white shadow mb-4">
            <h2 className="font-bold text-lg mb-2">{key}</h2>
            <pre className="text-sm text-gray-600">
              {JSON.stringify(section, null, 2)}
            </pre>
          </div>
        );
    }
  };

  const subtitle =
    personaCode === "student" && subLevel
      ? ` (${personaConfig.sub_levels?.[subLevel]?.label_it ?? subLevel})`
      : "";

  return (
    <div>
      <LandingHeader title={`${personaConfig.label_it}${subtitle}`} />
      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <SectionImpostazioni />
        {Object.entries(personaConfig.sections).map(([key, section]) =>
          renderSection(key, section)
        )}
      </main>
    </div>
  );
}
