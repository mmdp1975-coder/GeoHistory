// src/app/register/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabaseBrowserClient";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [acceptTos, setAcceptTos] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<string | null>(null);
  const [resendInfo, setResendInfo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setDuplicateInfo(null);
    setResendInfo(null);

    // Validazioni
    if (!email || !password || !confirm || !acceptTos) {
      setErrorMsg("Compila i campi obbligatori e accetta i Termini.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Le password non coincidono.");
      return;
    }
    if (username && !/^[a-z0-9_\.]{3,20}$/i.test(username)) {
      setErrorMsg("Username non valido (3–20 caratteri, lettere/numeri/._).");
      return;
    }

    try {
      setLoading(true);

      const redirectTo = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: fullName || "",
            username: username || "",
            newsletter: newsletter,
          },
        },
      });

      // Caso 1: errore esplicito da Supabase (es. user_already_registered)
      if (error) {
        // Tipico messaggio: "User already registered"
        if (String(error.message).toLowerCase().includes("already")) {
          setDuplicateInfo(
            "Questa email risulta già registrata. Accedi o reimposta la password. Se non avevi confermato l’email, puoi provare a reinviare la conferma."
          );
        } else {
          setErrorMsg(error.message ?? "Registrazione fallita");
        }
        return;
      }

      // Caso 2: nessun errore ma identities vuote ⇒ email già registrata (caso noto Supabase)
      const identities = data?.user?.identities ?? [];
      if (identities.length === 0) {
        setDuplicateInfo(
          "Questa email risulta già registrata. Accedi o reimposta la password. Se non avevi confermato l’email, puoi provare a reinviare la conferma."
        );
        return;
      }

      // Caso 3: registrazione nuova andata a buon fine
      setSuccessMsg(
        "Registrazione inviata. Se la conferma email è attiva, controlla la casella di posta e segui il link."
      );
      setFullName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirm("");
      setNewsletter(false);
      setAcceptTos(false);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Registrazione fallita");
    } finally {
      setLoading(false);
    }
  };

  // Reinvio conferma per utenti NON confermati
  const onResend = async () => {
    setResendInfo(null);
    setErrorMsg(null);
    if (!email) {
      setErrorMsg("Inserisci l’email nel form per inviare nuovamente la conferma.");
      return;
    }
    try {
      setLoading(true);
      const redirectTo = `${window.location.origin}/`;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        // Tipico messaggio se già confermato: "Email link is invalid or has expired" / "User already confirmed"
        setResendInfo(
          "Se l’utente è già confermato, non verrà inviata una nuova email. In tal caso usa direttamente Accedi o Reimposta password."
        );
      } else {
        setResendInfo("Se l’utente non era confermato, è stata inviata una nuova email di conferma.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Impossibile inviare la conferma");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gh-register">
      {/* Nasconde UI globale della mappa su /register */}
      <style jsx global>{`
        .gh-app, .gh-header, .gh-time, .gh-main, .gh-details, .gh-bottomsheet,
        .gh-readerbar, .gh-overlay, .gh-sheet, .gh-fab, .leaflet-container {
          display: none !important;
        }
      `}</style>

      <style jsx>{`
        .gh-register { position:relative; min-height:100vh; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#111827; overflow:hidden;}
        .bg { position:fixed; inset:0; background-image:url("/bg/login-map.jpg"); background-size:cover; background-position:center; opacity:.7; z-index:0;}
        .veil { position:fixed; inset:0; background:linear-gradient(to bottom, rgba(0,0,0,.15), transparent, rgba(0,0,0,.25)); z-index:1;}
        .header { position:relative; z-index:2; display:flex; justify-content:center; align-items:center; padding-top:24px;}
        .brand { display:flex; gap:12px; align-items:center;}
        .brand img { width:56px; height:56px; object-fit:contain;}
        .title { font-weight:900; font-size:clamp(28px,4vw,40px); letter-spacing:-.02em;}
        .main { position:relative; z-index:2; padding:48px 16px 64px; display:flex; justify-content:center;}
        .card { width:100%; max-width:640px; background:rgba(255,255,255,.92); backdrop-filter:saturate(140%) blur(6px);
          border:1px solid #e5e7eb; border-radius:16px; box-shadow:0 15px 40px rgba(0,0,0,.15); padding:28px 24px;}
        .card h2 { margin:0 0 16px; font-size:24px; font-weight:800;}
        .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px;}
        .grid .full { grid-column: 1 / -1; }
        .field { margin-bottom:14px;}
        .label { display:block; margin-bottom:6px; font-size:13px; color:#374151; font-weight:600;}
        .input { width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:10px; font-size:15px; color:#111827;}
        .checkbox { display:flex; gap:10px; align-items:flex-start; font-size:14px; color:#374151; }
        .error { margin:8px 0; padding:8px 12px; font-size:13px; color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; border-radius:10px;}
        .success { margin:8px 0; padding:8px 12px; font-size:13px; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px;}
        .info { margin:8px 0; padding:8px 12px; font-size:13px; color:#1f2937; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:10px;}
        .button { width:100%; padding:12px 14px; border:0; border-radius:10px; background:#000; color:#fff; font-weight:700; cursor:pointer;}
        .secondary { width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:10px; background:#fff; color:#111827; font-weight:700; cursor:pointer;}
        .actions { display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top: 8px; }
        .bottom { margin-top:16px; text-align:center; font-size:14px; color:#374151;}
        .bottom a { font-weight:700; color:#111827;}
        @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .actions { grid-template-columns: 1fr; } }
      `}</style>

      <div className="bg" />
      <div className="veil" />

      <header className="header">
        <div className="brand">
          <img src="/logo.png" alt="GeoHistory Journey" />
          <div className="title">GeoHistory <strong>Journey</strong></div>
        </div>
      </header>

      <main className="main">
        <div className="card">
          <h2>Crea il tuo account</h2>

          <form onSubmit={onSubmit}>
            <div className="grid">
              <div className="field">
                <label className="label">Nome e cognome (opz.)</label>
                <input className="input" type="text" value={fullName} onChange={(e)=>setFullName(e.target.value)} placeholder="Mario Rossi" />
              </div>
              <div className="field">
                <label className="label">Username (opz., univoco)</label>
                <input className="input" type="text" value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="mario.rossi" />
              </div>

              <div className="field full">
                <label className="label">Email *</label>
                <input className="input" type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" />
              </div>

              <div className="field">
                <label className="label">Password *</label>
                <input className="input" type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Almeno 8 caratteri" />
              </div>
              <div className="field">
                <label className="label">Conferma password *</label>
                <input className="input" type="password" required value={confirm} onChange={(e)=>setConfirm(e.target.value)} placeholder="Ripeti la password" />
              </div>
            </div>

            <div className="field checkbox">
              <input id="tos" type="checkbox" checked={acceptTos} onChange={(e)=>setAcceptTos(e.target.checked)} />
              <label htmlFor="tos">
                Ho letto e accetto i <a href="/terms" target="_blank" rel="noreferrer">Termini di servizio</a> e l’<a href="/privacy" target="_blank" rel="noreferrer">Informativa privacy</a> *
              </label>
            </div>

            <div className="field checkbox">
              <input id="news" type="checkbox" checked={newsletter} onChange={(e)=>setNewsletter(e.target.checked)} />
              <label htmlFor="news">Desidero ricevere aggiornamenti via email (facoltativo)</label>
            </div>

            {errorMsg && <div className="error" role="alert">{errorMsg}</div>}
            {successMsg && <div className="success" role="status">{successMsg}</div>}
            {duplicateInfo && (
              <div className="info" role="status">
                {duplicateInfo}
                <div className="actions">
                  <Link className="secondary" href="/login">Accedi</Link>
                  <Link className="secondary" href="/forgot-password">Reimposta password</Link>
                </div>
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="secondary" onClick={onResend} disabled={loading}>Reinvia email di conferma</button>
                  {resendInfo && <div className="info" style={{ marginTop: 8 }}>{resendInfo}</div>}
                </div>
              </div>
            )}

            <button type="submit" className="button" disabled={loading}>
              {loading ? "Invio in corso…" : "Crea account"}
            </button>
          </form>

          <div className="bottom">
            Hai già un account? <Link href="/login">Accedi</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
