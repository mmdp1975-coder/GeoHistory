// app/login/forgot/page.tsx
"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabaseBrowserClient";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);
    const redirectTo = `${window.location.origin}/login`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) setErr(error.message);
    else setMsg("Email inviata. Controlla la casella di posta.");
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold mb-4">Password dimenticata</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input
          className="w-full border rounded p-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <button className="w-full bg-blue-600 text-white rounded p-2">Invia link di reset</button>
      </form>
      {msg && <p className="text-green-700 text-sm mt-3">{msg}</p>}
      {err && <p className="text-red-600 text-sm mt-3">{err}</p>}
    </main>
  );
}


