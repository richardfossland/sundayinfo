"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch {
      setError("Klarte ikke å sende lenken — sjekk adressen og prøv igjen.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="shell" style={{ maxWidth: 440, paddingTop: "12vh" }}>
      <h1 className="brand" style={{ fontSize: "2rem", marginBottom: 6 }}>
        Sunday<em>Info</em>
      </h1>
      <p className="lede">Infoskjermen for menigheten — logg inn for å styre innholdet.</p>

      <div className="card">
        {sent ? (
          <p>
            Sjekk innboksen til <b>{email}</b> — vi har sendt deg en innloggingslenke.
          </p>
        ) : (
          <form onSubmit={sendMagicLink}>
            <div className="field">
              <label htmlFor="email">E-post</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deg@menigheten.no"
                autoComplete="email"
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-block" disabled={busy}>
              {busy ? "Sender …" : "Send innloggingslenke"}
            </button>
          </form>
        )}
      </div>

      <button className="btn btn-ghost btn-block" onClick={signInWithGoogle}>
        Logg inn med Google
      </button>
    </div>
  );
}
