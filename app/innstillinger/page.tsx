"use client";

import { useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import { api, errorText } from "@/lib/client/api";
import { useChurch } from "@/lib/client/useChurch";

export default function SettingsPage() {
  const { me, loading, membership, select } = useChurch();
  const churchId = membership?.churchId ?? null;
  const isAdmin = membership?.role === "admin";
  const [vipps, setVipps] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [showFacilities, setShowFacilities] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!churchId) return;
    api
      .get<{ vippsNumber: string | null; settings: Record<string, unknown> }>(
        `/api/settings?churchId=${churchId}`,
      )
      .then((d) => {
        setVipps(d.vippsNumber ?? "");
        setSettings(d.settings ?? {});
        setShowFacilities(d.settings?.showFacilities === true);
      })
      .catch(() => {});
  }, [churchId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.put("/api/settings", {
        churchId,
        vippsNumber: vipps.trim() || null,
        settings: { ...settings, showFacilities },
      });
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !me || !churchId) return null;

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Innstillinger</h1>
      <div className="card">
        <h2>Vipps</h2>
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="set-vipps">Vippsnummer</label>
            <input
              id="set-vipps"
              value={vipps}
              onChange={(e) => setVipps(e.target.value)}
              placeholder="F.eks. 12345"
              inputMode="numeric"
              disabled={!isAdmin}
            />
            <p className="hint">
              Brukes til ett-trykks «Gi med Vipps»-QR når du lager innhold.
            </p>
          </div>
          <div className="field">
            <label htmlFor="set-facilities">
              <input
                id="set-facilities"
                type="checkbox"
                checked={showFacilities}
                onChange={(e) => setShowFacilities(e.target.checked)}
                disabled={!isAdmin}
                style={{ width: "auto", marginRight: 8 }}
              />
              Vis «Lokaler i bruk»
            </label>
            <p className="hint">
              Henter romstatus fra SundayBooking (om appen er i bruk) og viser
              hvilke lokaler som er opptatt nå og når de blir ledige. Vises ikke
              hvis SundayBooking ikke er satt opp.
            </p>
          </div>
          {error && <p className="error-text">{error}</p>}
          {saved && <p style={{ color: "var(--ok)", marginBottom: 8 }}>Lagret!</p>}
          {isAdmin && (
            <button className="btn" disabled={busy}>
              {busy ? "Lagrer …" : "Lagre"}
            </button>
          )}
        </form>
      </div>
    </AdminShell>
  );
}
