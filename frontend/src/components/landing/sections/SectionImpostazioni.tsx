// src/components/landing/sections/SectionImpostazioni.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseBrowserClient";

type PersonaSummary = { code?: string | null; sub_level?: string | null; label?: string | null };

export default function SectionImpostazioni() {
  const [savingLang, setSavingLang] = useState(false);
  const [lang, setLang] = useState<string>("it");
  const [email, setEmail] = useState<string>("");
  const [persona, setPersona] = useState<PersonaSummary>({ code: null, sub_level: null, label: null });

  const [pwd1, setPwd1] = useState(""); const [pwd2, setPwd2] = useState("");
  const [changingPwd, setChangingPwd] = useState(false); const [pwdMsg, setPwdMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setEmail(user.email ?? "");

      const { data: prof } = await supabase
        .from("profiles")
        .select("language, locale, personas(code, sub_level, name_it, name_en)")
        .eq("id", user.id)
        .single();

      const detected =
        (prof as any)?.language ??
        (prof as any)?.locale ??
        (typeof navigator !== "undefined" ? (navigator.language || "it").slice(0, 2) : "it");
      setLang(["it","en"].includes(detected) ? detected : "it");

      if (prof?.personas) {
        const p = prof.personas as any;
        setPersona({ code: p.code, sub_level: p.sub_level, label: p.name_it ?? p.name_en ?? p.code });
      }
    };
    load();
  }, []);

  const saveLanguage = async () => {
    setSavingLang(true);
    try {
      const { data: check } = await supabase.from("profiles").select("*").limit(1);
      const columns = check && check[0] ? Object.keys(check[0]) : [];
      if (columns.includes("language")) await supabase.from("profiles").update({ language: lang });
      else if (columns.includes("locale")) await supabase.from("profiles").update({ locale: lang });
      alert("Lingua aggiornata.");
    } catch { alert("Errore salvataggio lingua"); }
    finally { setSavingLang(false); }
  };

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setPwdMsg(null);
    if (!pwd1 || !pwd2) { setPwdMsg("Inserisci la nuova password in entrambi i campi."); return; }
    if (pwd1 !== pwd2) { setPwdMsg("Le password non coincidono."); return; }
    if (pwd1.length < 8) { setPwdMsg("La password deve avere almeno 8 caratteri."); return; }
    try {
      setChangingPwd(true);
      const { error } = await supabase.auth.updateUser({ password: pwd1 });
      if (error) throw error;
      setPwd1(""); setPwd2(""); setPwdMsg("✅ Password aggiornata con successo.");
    } catch (err: any) { setPwdMsg(err?.message ?? "Errore durante l’aggiornamento della password."); }
    finally { setChangingPwd(false); }
  };

  return (
    <div className="p-4 border rounded-lg bg-white shadow mb-4">
      <h2 className="font-bold text-lg mb-3">Impostazioni</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="p-3 border rounded-md bg-gray-50">
          <p className="text-sm text-gray-600">Profilo</p>
          <p className="text-sm font-semibold mt-1">{email}</p>
          <p className="text-xs text-gray-600 mt-1">
            Persona: <span className="font-medium">{persona.label ?? persona.code ?? "—"}</span>
            {persona.sub_level ? ` (${persona.sub_level})` : ""}
          </p>
          <div className="mt-2"><a href="/profile" className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm hover:bg-black">Apri profilo</a></div>
        </div>

        <div className="p-3 border rounded-md bg-gray-50">
          <p className="text-sm text-gray-600">Lingua interfaccia</p>
          <div className="mt-2 flex items-center gap-2">
            <select value={lang} onChange={(e)=>setLang(e.target.value)} className="border rounded px-2 py-1 text-sm">
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </select>
            <button onClick={saveLanguage} disabled={savingLang}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {savingLang ? "Salvataggio…" : "Salva"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Salvato in <code>profiles.language</code> o <code>profiles.locale</code>.</p>
        </div>
      </div>

      <div className="mt-4 p-3 border rounded-md bg-gray-50">
        <p className="text-sm text-gray-600 font-semibold mb-2">Cambio password</p>
        <form onSubmit={onChangePassword} className="grid gap-2 max-w-sm">
          <input type="password" className="border rounded px-3 py-2 text-sm" placeholder="Nuova password"
                 value={pwd1} onChange={(e)=>setPwd1(e.target.value)} />
          <input type="password" className="border rounded px-3 py-2 text-sm" placeholder="Ripeti nuova password"
                 value={pwd2} onChange={(e)=>setPwd2(e.target.value)} />
          {pwdMsg && <div className={`text-sm ${pwdMsg.startsWith("✅") ? "text-green-700" : "text-red-700"}`}>{pwdMsg}</div>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={changingPwd}
              className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm hover:bg-black disabled:opacity-60">
              {changingPwd ? "Aggiornamento…" : "Aggiorna password"}
            </button>
            <a href="/forgot-password" className="text-sm underline text-blue-700">Hai dimenticato la password?</a>
          </div>
        </form>
      </div>
    </div>
  );
}
