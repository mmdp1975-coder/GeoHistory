// File: src/app/profile/page.tsx

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Persona = {
  id: string;
  code: string;
  sub_level: string | null;
  name_it: string;
  name_en: string;
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [profile, setProfile] = useState<any>(null);

  const [personaId, setPersonaId] = useState<string>("");

  // Carica profilo + personas
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // 1) Recupero sessione
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setLoading(false);
        return;
      }

      // 2) Recupero profilo dell’utente loggato
      const { data: prof, error: profError } = await supabase
        .from("profiles")
        .select("id, email, full_name, persona_id")
        .eq("id", user.id)
        .single();

      if (!profError && prof) {
        setProfile(prof);
        if (prof.persona_id) {
          setPersonaId(prof.persona_id);
        }
      }

      // 3) Recupero tutte le personas attive
      const { data: pers, error: persError } = await supabase
        .from("personas")
        .select("id, code, sub_level, name_it, name_en")
        .eq("is_active", true)
        .order("code", { ascending: true })
        .order("sub_level", { ascending: true });

      if (!persError && pers) {
        setPersonas(pers);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  // Trova la persona selezionata
  const selectedPersona = personas.find((p) => p.id === personaId);
  const isStudent = selectedPersona?.code === "student";

  // Opzioni sub_level (solo studenti)
  const studentLevels = personas.filter((p) => p.code === "student");

  const handleSave = async () => {
    if (!profile) return;

    const { error } = await supabase
      .from("profiles")
      .update({ persona_id: personaId })
      .eq("id", profile.id);

    if (error) {
      alert("Errore nel salvataggio: " + error.message);
    } else {
      alert("Profilo aggiornato con successo!");
    }
  };

  if (loading) {
    return <div className="p-6">Caricamento...</div>;
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Profilo utente</h1>

      <div>
        <label className="block text-sm font-medium">Email</label>
        <p className="mt-1 text-gray-700">{profile?.email}</p>
      </div>

      {/* Select Persona */}
      <div>
        <label className="block text-sm font-medium">Persona</label>
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        >
          <option value="">-- Seleziona persona --</option>
          {[...new Map(personas.map((p) => [p.code, p]))].values().map((p) => (
            <option key={p.code} value={p.id}>
              {p.name_it}
            </option>
          ))}
        </select>
      </div>

      {/* Sub-level solo se persona = student */}
      {isStudent && (
        <div>
          <label className="block text-sm font-medium">Livello</label>
          <select
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          >
            <option value="">-- Seleziona livello --</option>
            {studentLevels.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name_it}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={handleSave}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Salva
      </button>
    </div>
  );
}
