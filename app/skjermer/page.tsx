"use client";

import { useCallback, useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import { api, errorText } from "@/lib/client/api";
import { lastSeenBadge } from "@/lib/client/lastSeen";
import { useChurch } from "@/lib/client/useChurch";

type ScreenRow = {
  id: string;
  name: string;
  zone_id: string | null;
  status: string;
  last_seen_at: string | null;
};
type Zone = { id: string; name: string };

export default function ScreensPage() {
  const { me, loading, membership, select } = useChurch();
  const churchId = membership?.churchId ?? null;
  const [screens, setScreens] = useState<ScreenRow[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  const load = useCallback(async () => {
    if (!churchId) return;
    const [s, z] = await Promise.all([
      api.get<{ screens: ScreenRow[] }>(`/api/screens?churchId=${churchId}`),
      api.get<{ zones: Zone[] }>(`/api/zones?churchId=${churchId}`),
    ]);
    setScreens(s.screens.filter((x) => x.status === "paired"));
    setZones(z.zones);
  }, [churchId]);

  useEffect(() => {
    load().catch(() => {});
    const id = setInterval(() => load().catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading || !me || !churchId) return null;

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Skjermer</h1>
      <p className="lede">
        Åpne <b>info.sundaysuite.app/skjerm</b> på TV-en — den viser en kode du
        taster inn her.
      </p>

      <ClaimCard churchId={churchId} zones={zones} onClaimed={load} />

      <div className="card">
        <h2>Tilkoblede skjermer</h2>
        {screens.length === 0 ? (
          <p className="empty">Ingen skjermer ennå.</p>
        ) : (
          screens.map((s) => (
            <ScreenRowView key={s.id} screen={s} zones={zones} onChanged={load} />
          ))
        )}
      </div>
    </AdminShell>
  );
}

function ClaimCard({
  churchId,
  zones,
  onClaimed,
}: {
  churchId: string;
  zones: Zone[];
  onClaimed: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [zoneId, setZoneId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (zones.length > 0 && !zoneId) setZoneId(zones[0].id);
  }, [zones, zoneId]);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api.post("/api/pair/claim", {
        code: code.trim().toUpperCase().replace(/\s+/g, ""),
        churchId,
        zoneId: zoneId || null,
        name: name.trim(),
      });
      setDone(true);
      setCode("");
      setName("");
      onClaimed();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Koble til ny skjerm</h2>
      {done && <p style={{ color: "var(--ok)", marginBottom: 8 }}>Skjermen er koblet til! Den starter av seg selv om noen sekunder.</p>}
      <form onSubmit={claim}>
        <div className="field">
          <label htmlFor="s-code">Kode fra TV-en</label>
          <input
            id="s-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="F.eks. K7M2PX"
            autoCapitalize="characters"
            autoComplete="off"
            style={{ fontFamily: "var(--mono)", letterSpacing: "0.15em", textTransform: "uppercase" }}
          />
        </div>
        <div className="field">
          <label htmlFor="s-name">Navn på skjermen</label>
          <input
            id="s-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="F.eks. Foajé-TV"
          />
        </div>
        {zones.length > 1 && (
          <div className="field">
            <label htmlFor="s-zone">Sone</label>
            <select id="s-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-block" disabled={busy || code.trim().length < 4}>
          {busy ? "Kobler til …" : "Koble til"}
        </button>
      </form>
    </div>
  );
}

function ScreenRowView({
  screen,
  zones,
  onChanged,
}: {
  screen: ScreenRow;
  zones: Zone[];
  onChanged: () => void;
}) {
  const badge = lastSeenBadge(screen.last_seen_at);
  const zoneName = zones.find((z) => z.id === screen.zone_id)?.name ?? "—";

  async function setZone(zoneId: string) {
    await api.patch(`/api/screens/${screen.id}`, { zoneId });
    onChanged();
  }

  async function rename() {
    const name = prompt("Nytt navn:", screen.name);
    if (!name?.trim()) return;
    await api.patch(`/api/screens/${screen.id}`, { name: name.trim() });
    onChanged();
  }

  async function revoke() {
    if (!confirm(`Koble fra «${screen.name}»? TV-en går tilbake til paringskoden.`)) return;
    await api.patch(`/api/screens/${screen.id}`, { revoke: true });
    onChanged();
  }

  return (
    <div className="card-row">
      <span style={{ flex: 1 }}>
        <b>{screen.name || "Skjerm"}</b>
        <span style={{ color: "var(--txt-faint)", marginLeft: 8, fontSize: "0.82rem" }}>
          {zoneName}
        </span>
      </span>
      <span className={`badge ${badge.cls}`}>{badge.label}</span>
      {zones.length > 1 && (
        <select
          value={screen.zone_id ?? ""}
          onChange={(e) => setZone(e.target.value)}
          style={{
            background: "var(--ink)",
            color: "var(--txt)",
            border: "1px solid var(--ink-line-strong)",
            borderRadius: 8,
            padding: "4px 6px",
            fontSize: "0.82rem",
          }}
        >
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      )}
      <button className="btn btn-sm btn-ghost" onClick={rename}>
        ✎
      </button>
      <button className="btn btn-sm btn-ghost" onClick={revoke}>
        ✕
      </button>
    </div>
  );
}
