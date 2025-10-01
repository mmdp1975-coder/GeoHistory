// src/app/forgot-password/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabaseBrowserClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email) {
      setErrorMsg("Inserisci una email valida.");
      return;
    }

    try {
      setLoading(true);
      const redirectTo = `${window.location.origin}/`; // puoi usare una pagina dedicata al reset
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
      setSuccessMsg("Se l'email esiste, riceverai un link per reimpostare la password.");
      setEmail("");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Invio fallito");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gh-forgotp">
      <style jsx global>{`
        .gh-app,
        .gh-header,
        .gh-time,
        .gh-main,
        .gh-details,
        .gh-bottomsheet,
        .gh-readerbar,
        .gh-overlay,
        .gh-sheet,
        .gh-fab,
        .leaflet-container {
          display: none !important;
        }
      `}</style>

      <style jsx>{`
        .gh-forgotp {
          position: relative;
          min-height: 100vh;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
          color: #111827;
          overflow: hidden;
        }
        .bg, .veil {
          position: fixed; inset: 0; z-index: 0;
        }
        .bg { background-image: url("/bg/login-map.jpg"); background-size: cover; background-position: center; opacity: .7; }
        .veil { background: linear-gradient(to bottom, rgba(0,0,0,.15), transparent, rgba(0,0,0,.25)); }
        .wrap { position: relative; z-index: 2; padding: 48px 16px 64px; display: flex; justify-content: center; }
        .card {
          width: 100%; max-width: 560px;
          background: rgba(255,255,255,.92);
          backdrop-filter: saturate(140%) blur(6px);
          border: 1px solid #e5e7eb; border-radius: 16px;
          box-shadow: 0 15px 40px rgba(0,0,0,.15);
          padding: 28px 24px;
        }
        .field { margin-bottom: 14px; }
        .label { display:block; margin-bottom:6px; font-size:13px; color:#374151; font-weight:600;}
        .input { width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:10px; font-size:15px; color:#111827;}
        .btn { width:100%; padding:12px 14px; border:0; border-radius:10px; background:#000; color:#fff; font-weight:700; cursor:pointer; }
        .error { margin:8px 0; padding:8px 12px; font-size:13px; color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; }
        .success { margin:8px 0; padding:8px 12px; font-size:13px; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; }
        .back { margin-top: 16px; text-align: center; font-size: 14px; color: #374151; }
        .back a { font-weight: 700; color: #111827; }
      `}</style>

      <div className="bg" />
      <div className="veil" />

      <main className="wrap">
        <div className="card">
          <h2>Reimposta la password</h2>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {errorMsg && <div className="error">{errorMsg}</div>}
            {successMsg && <div className="success">{successMsg}</div>}
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Invio in corso…" : "Invia link di reset"}
            </button>
          </form>

          <div className="back">
            Torna al <Link href="/login">Login</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
