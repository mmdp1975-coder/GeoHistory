ï»¿// app/login/register/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabaseBrowserClient";
import postLoginRedirect from "../../lib/postLoginRedirect";

const PERSONAS = [
  "student-primary",
  "student-middle",
  "student-high",
  "enthusiastic",
  "researcher",
  "moderator",
  "admin",
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [persona, setPersona] = useState<(typeof PERSONAS)[number]>("student-primary");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const { data: signUp, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { persona } },
    });
    if (signErr) { setLoading(false); setErr(signErr.message); return; }

    const user = signUp.user ?? null;
    setLoading(false);

    if (!user) {
      alert("Registrazione avviata. Controlla la mail per confermare lâ€™account.");
      return;
    }

    const dest = postLoginRedirect(user);
    router.push(dest);
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold mb-4">Registrati</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input
          className="w-full border rounded p-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <div>
          <label className="block text-sm font-medium mb-1">Persona</label>
          <select
            className="w-full border rounded p-2"
            value={persona}
            onChange={e => setPersona(e.target.value as any)}
          >
            {PERSONAS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button
          className="w-full bg-blue-600 text-white rounded p-2 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Creazione..." : "Crea account"}
        </button>
        {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
      </form>
    </main>
  );
}



