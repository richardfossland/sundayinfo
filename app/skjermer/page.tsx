"use client";

import { useCallback, useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import { api, errorText } from "@/lib/client/api";
import {
  deviceLabel,
  isOnline,
  lastSeenAgo,
  lastSeenBadge,
} from "@/lib/client/lastSeen";
import { useChurch } from "@/lib/client/useChurch";

type PendingCommand = {
  command_id: string;
  refresh_now: boolean;
  goto_zone_id: string | null;
  issued_at: string;
} | null;

type ScreenRow = {
  id: string;
  church_id: string;
  name: string;
  zone_id: string | null;
  status: string;
  last_seen_at: string | null;
  last_user_agent: string | null;
  now_showing: string | null;
  showing_zone_id: string | null;
  current_version: string | null;
  pending_command: PendingCommand;
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
    // Poll on the same ~30 s cadence as the display heartbeat so health and
    // "currently showing" stay fresh without a websocket.
    const id = setInterval(() => load().catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading || !me || !churchId) return null;

  const onlineCount = screens.filter((s) => isOnline(s.last_seen_at)).length;

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Skjermer</h1>
      <p className="lede">
        Åpne <b>info.sundaysuite.app/skjerm</b> på TV-en — den viser en kode du
        taster inn her.
      </p>

      <ClaimCard churchId={churchId} zones={zones} onClaimed={load} />

      <div className="card">
        <h2>
          Tilkoblede skjermer{" "}
          {screens.length > 0 && (
            <span className={`badge ${onlineCount > 0 ? "badge-ok" : "badge-dim"}`}>
              {onlineCount}/{screens.length} på lufta
            </span>
          )}
        </h2>
        {screens.length === 0 ? (
          <p className="empty">Ingen skjermer ennå.</p>
        ) : (
          screens.map((s) => (
            <ScreenCard key={s.id} screen={s} zones={zones} onChanged={load} />
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
      {done && (
        <p style={{ color: "var(--ok)", marginBottom: 8 }}>
          Skjermen er koblet til! Den starter av seg selv om noen sekunder.
        </p>
      )}
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
            style={{
              fontFamily: "var(--mono)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
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

function ScreenCard({
  screen,
  zones,
  onChanged,
}: {
  screen: ScreenRow;
  zones: Zone[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const online = isOnline(screen.last_seen_at);
  const badge = lastSeenBadge(screen.last_seen_at);
  const zoneName = zones.find((z) => z.id === screen.zone_id)?.name ?? "—";
  const showingZoneName =
    screen.showing_zone_id && screen.showing_zone_id !== screen.zone_id
      ? zones.find((z) => z.id === screen.showing_zone_id)?.name
      : null;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await fn();
      setFlash(label);
      setTimeout(() => setFlash(null), 6_000);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const setAssignedZone = (zoneId: string) =>
    run("Sone endret", () => api.patch(`/api/screens/${screen.id}`, { zoneId }));

  const forceRefresh = () =>
    run("Oppdatering sendt — skjermen henter nytt innhold ved neste puls.", () =>
      api.post(`/api/screens/${screen.id}`, { refreshNow: true }),
    );

  const pushToZone = (zoneId: string) =>
    run("Sendt til sone — vises som forhåndsvisning på skjermen.", () =>
      api.post(`/api/screens/${screen.id}`, { gotoZoneId: zoneId, refreshNow: true }),
    );

  const backToAssigned = () =>
    run("Tilbake til egen sone.", () =>
      api.post(`/api/screens/${screen.id}`, { gotoZoneId: null, refreshNow: true }),
    );

  async function rename() {
    const name = prompt("Nytt navn:", screen.name);
    if (!name?.trim()) return;
    await run("Navn endret", () =>
      api.patch(`/api/screens/${screen.id}`, { name: name.trim() }),
    );
  }

  async function revoke() {
    if (!confirm(`Koble fra «${screen.name}»? TV-en går tilbake til paringskoden.`))
      return;
    await run("Frakoblet", () => api.patch(`/api/screens/${screen.id}`, { revoke: true }));
  }

  const pending = screen.pending_command;

  return (
    <div className="scr">
      <div className="scr-head">
        <span className={`scr-dot ${online ? "on" : "off"}`} aria-hidden />
        <span className="scr-name">{screen.name || "Skjerm"}</span>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        {pending && (
          <span className="badge badge-warn" title="Venter på neste puls">
            kommando sendt
          </span>
        )}
      </div>

      <div className="scr-meta">
        <span>
          <span className="k">Sone</span>
          {zoneName}
          {showingZoneName && (
            <span style={{ color: "var(--warn)" }}> → viser {showingZoneName}</span>
          )}
        </span>
        <span className="scr-showing">
          <span className="k">Viser nå</span>
          {screen.now_showing || (online ? "—" : "ukjent (frakoblet)")}
        </span>
        <span>
          <span className="k">Sist sett</span>
          {lastSeenAgo(screen.last_seen_at)}
          <span style={{ color: "var(--txt-faint)" }}>
            {" · "}
            {deviceLabel(screen.last_user_agent)}
          </span>
        </span>
      </div>

      <div className="scr-actions">
        <button className="btn btn-sm" disabled={busy} onClick={forceRefresh}>
          Oppdater nå
        </button>

        {zones.length > 1 && (
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              if (v) pushToZone(v);
              e.target.value = "";
            }}
            aria-label="Send skjerm til sone"
          >
            <option value="">Send til sone …</option>
            {zones
              .filter((z) => z.id !== screen.zone_id)
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
          </select>
        )}

        {showingZoneName && (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={backToAssigned}>
            Tilbake til egen sone
          </button>
        )}

        <TestButton screen={screen} onRun={run} busy={busy} />

        {zones.length > 1 && (
          <select
            value={screen.zone_id ?? ""}
            disabled={busy}
            onChange={(e) => setAssignedZone(e.target.value)}
            aria-label="Fast sone"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                Fast: {z.name}
              </option>
            ))}
          </select>
        )}

        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={rename}>
          ✎ Navn
        </button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={revoke}>
          ✕ Koble fra
        </button>
      </div>

      {flash && <p className="scr-flash">{flash}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// A targeted test/emergency message. Reuses the emergency API but scopes it to
// THIS screen's zone so only this screen (and others in its zone) light up.
function TestButton({
  screen,
  onRun,
  busy,
}: {
  screen: ScreenRow;
  onRun: (label: string, fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
}) {
  async function send() {
    const text =
      prompt("Testmelding til denne skjermen:", "Test fra adminpanelet") ?? "";
    if (!text.trim()) return;
    await onRun("Testmelding sendt til sonen (synlig i ~5 min).", () =>
      api.post(`/api/emergency`, {
        churchId: screen.church_id,
        zoneId: screen.zone_id,
        body: text.trim(),
        minutes: 5,
      }),
    );
  }
  return (
    <button className="btn btn-sm btn-ghost" disabled={busy} onClick={send}>
      Test/melding
    </button>
  );
}
