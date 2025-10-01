ï»¿// app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import postLoginRedirect from "../../lib/postLoginRedirect";
import { createClient } from "../../lib/supabaseBrowserClient";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }
    const user = data.user ?? null;
    const dest = postLoginRedirect(user);
    router.push(dest);
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold mb-4">Login</h1>

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
        <button
          className="w-full bg-blue-600 text-white rounded p-2 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Accesso..." : "Entra"}
        </button>
        {err && <p className="text-red-600 text-sm">{err}</p>}
      </form>

      <div className="mt-3 flex justify-between text-sm">
        <a href="/login/forgot" className="underline">Password dimenticata</a>
        <a href="/login/register" className="underline">Registrati</a>
      </div>
    </main>
  );
}



