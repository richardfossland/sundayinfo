"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import { api, errorText } from "@/lib/client/api";
import { lastSeenBadge } from "@/lib/client/lastSeen";
import { useChurch } from "@/lib/client/useChurch";
import { createClient } from "@/lib/supabase/client";

type ScreenRow = {
  id: string;
  name: string;
  zone_id: string | null;
  status: string;
  last_seen_at: string | null;
};

export default function Dashboard() {
  const { me, loading, membership, select, refresh } = useChurch();
  const churchId = membership?.churchId ?? null;
  const [screens, setScreens] = useState<ScreenRow[]>([]);
  const [screensError, setScreensError] = useState(false);

  const loadScreens = useCallback(async () => {
    if (!churchId) return;
    try {
      const data = await api.get<{ screens: ScreenRow[] }>(
        `/api/screens?churchId=${churchId}`,
      );
      setScreens(data.screens.filter((s) => s.status === "paired"));
      setScreensError(false);
    } catch {
      // Keep the last good list on screen, but surface a small inline notice
      // instead of degrading silently.
      setScreensError(true);
    }
  }, [churchId]);

  useEffect(() => {
    loadScreens();
    const id = setInterval(loadScreens, 60_000);
    return () => clearInterval(id);
  }, [loadScreens]);

  if (loading) return <DashboardSkeleton />;

  if (!me || me.memberships.length === 0) {
    return <Onboarding onCreated={refresh} />;
  }

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Hjem</h1>

      <EmergencyCard churchId={churchId!} />

      <div className="card">
        <h2>Skjermer</h2>
        {screensError && (
          <p className="inline-error" role="status">
            Klarte ikke å hente skjermstatus — viser sist kjente. Prøver igjen
            automatisk.
          </p>
        )}
        {screens.length === 0 ? (
          <p className="empty">
            Ingen skjermer ennå — åpne <b>info.sundaysuite.app/skjerm</b> på en TV og{" "}
            <Link href="/skjermer">koble den til</Link>.
          </p>
        ) : (
          screens.map((s) => <ScreenStatusRow key={s.id} screen={s} />)
        )}
      </div>

      <div className="card">
        <h2>Kom i gang</h2>
        <div className="card-row">
          <span>Legg inn ukens program og gudstjenestetider</span>
          <Link className="btn btn-sm btn-ghost" href="/program">Program</Link>
        </div>
        <div className="card-row">
          <span>Skriv en kunngjøring (med utløpsdato!)</span>
          <Link className="btn btn-sm btn-ghost" href="/innhold/ny">Nytt innhold</Link>
        </div>
        <div className="card-row">
          <span>Inviter flere redaktører</span>
          <Link className="btn btn-sm btn-ghost" href="/medlemmer">Medlemmer</Link>
        </div>
        <div className="card-row">
          <span>Vippsnummer og standardtema</span>
          <Link className="btn btn-sm btn-ghost" href="/innstillinger">Innstillinger</Link>
        </div>
      </div>

      <SignOutButton />
    </AdminShell>
  );
}

/** While the session loads, mirror the dashboard's shape so the page doesn't
 *  flash empty (was: `if (loading) return null`). */
function DashboardSkeleton() {
  return (
    <div className="shell" aria-busy="true" aria-label="Laster …">
      <div className="topbar">
        <span className="brand">
          Sunday<em>Info</em>
        </span>
      </div>
      <div className="skel skel-title" />
      <div className="card">
        <div className="skel skel-line" style={{ width: "40%" }} />
        <div className="skel skel-row" />
      </div>
      <div className="card">
        <div className="skel skel-line" style={{ width: "30%" }} />
        <div className="skel skel-row" />
        <div className="skel skel-row" />
        <div className="skel skel-row" />
      </div>
      <span className="visually-hidden">Laster innholdet ditt …</span>
    </div>
  );
}

function ScreenStatusRow({ screen }: { screen: ScreenRow }) {
  const badge = lastSeenBadge(screen.last_seen_at);
  return (
    <div className="card-row">
      <span>{screen.name || "Skjerm"}</span>
      <span className={`badge ${badge.cls}`}>{badge.label}</span>
    </div>
  );
}

function EmergencyCard({ churchId }: { churchId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/emergency", { churchId, body: text.trim(), minutes });
      setActive(true);
      setOpen(false);
      setText("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await api.del(`/api/emergency?churchId=${churchId}`);
      setActive(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ borderColor: "rgba(210,85,77,0.4)" }}>
      <h2 style={{ color: "var(--danger)" }}>Hastemelding</h2>
      {active && (
        <p style={{ marginBottom: 10 }}>
          <span className="badge badge-danger">Aktiv på alle skjermer</span>
        </p>
      )}
      {open ? (
        <>
          <div className="field">
            <label htmlFor="em-text">Melding</label>
            <textarea
              id="em-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="F.eks. «Bil med reg. XX12345 sperrer utgangen»"
              maxLength={500}
            />
          </div>
          <div className="field">
            <label htmlFor="em-min">Vises i</label>
            <select
              id="em-min"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              <option value={5}>5 minutter</option>
              <option value={15}>15 minutter</option>
              <option value={30}>30 minutter</option>
              <option value={60}>1 time</option>
            </select>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-danger" disabled={busy || !text.trim()} onClick={send}>
              Vis på alle skjermer nå
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Avbryt
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-danger" onClick={() => setOpen(true)}>
            Send hastemelding
          </button>
          {active && (
            <button className="btn btn-ghost" disabled={busy} onClick={cancel}>
              Fjern aktiv melding
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Onboarding({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/churches", { name: name.trim() });
      onCreated();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="shell shell-narrow" style={{ paddingTop: "10vh" }}>
      <h1 className="brand" style={{ fontSize: "2rem", marginBottom: 6 }}>
        Sunday<em>Info</em>
      </h1>
      <p className="lede">
        Velkommen! Opprett menigheten din, så er infoskjermen i gang på under
        fem minutter.
      </p>
      <div className="card">
        <form onSubmit={create}>
          <div className="field">
            <label htmlFor="church-name">Menighetens navn</label>
            <input
              id="church-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Betania Fauske"
              required
              minLength={2}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-block" disabled={busy}>
            {busy ? "Oppretter …" : "Opprett menighet"}
          </button>
        </form>
      </div>
      <SignOutButton />
    </div>
  );
}

function SignOutButton() {
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ marginTop: 8 }}
      onClick={async () => {
        await createClient().auth.signOut();
        window.location.href = "/login";
      }}
    >
      Logg ut
    </button>
  );
}
