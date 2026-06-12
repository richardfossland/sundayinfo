"use client";

import { useCallback, useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import { api, errorText } from "@/lib/client/api";
import { useChurch } from "@/lib/client/useChurch";

type Zone = {
  id: string;
  name: string;
  theme: "dark" | "light" | "liturgical";
  settings: { slideDurationSeconds?: number };
};
type ItemRow = { id: string; title: string; body: string; zoneIds: string[] };

const THEME_LABELS = {
  dark: "Mørkt (suite)",
  light: "Lyst (papir)",
  liturgical: "Kirkeåret (farge følger kalenderen)",
} as const;

export default function ZonesPage() {
  const { me, loading, membership, select } = useChurch();
  const churchId = membership?.churchId ?? null;
  const isAdmin = membership?.role === "admin";
  const [zones, setZones] = useState<Zone[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!churchId) return;
    const [z, c] = await Promise.all([
      api.get<{ zones: Zone[] }>(`/api/zones?churchId=${churchId}`),
      api.get<{ items: ItemRow[] }>(`/api/content?churchId=${churchId}`),
    ]);
    setZones(z.zones);
    setItems(c.items);
  }, [churchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addZone() {
    if (!newName.trim() || !churchId) return;
    try {
      await api.post("/api/zones", { churchId, name: newName.trim() });
      setNewName("");
      load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (loading || !me || !churchId) return null;

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Soner</h1>
      <p className="lede">
        Én sone per plassering — foajé, kafé, barnerom — med eget tema og egen
        spilleliste.
      </p>

      {isAdmin && (
        <div className="card">
          <div className="field" style={{ display: "flex", gap: 8, marginBottom: 0 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ny sone, f.eks. Kafé"
              style={{ flex: 1 }}
            />
            <button className="btn" onClick={addZone}>
              Legg til
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}

      {zones.map((zone) => (
        <ZoneCard
          key={zone.id}
          zone={zone}
          items={items}
          isAdmin={!!isAdmin}
          onChanged={load}
        />
      ))}
    </AdminShell>
  );
}

function ZoneCard({
  zone,
  items,
  isAdmin,
  onChanged,
}: {
  zone: Zone;
  items: ItemRow[];
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const inZone = items.filter((i) => i.zoneIds.includes(zone.id));
  const [busy, setBusy] = useState(false);

  async function setTheme(theme: string) {
    await api.patch(`/api/zones/${zone.id}`, { theme });
    onChanged();
  }

  async function move(itemId: string, dir: -1 | 1) {
    const order = inZone.map((i) => i.id);
    const idx = order.indexOf(itemId);
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    [order[idx], order[swap]] = [order[swap], order[idx]];
    setBusy(true);
    try {
      await api.put(`/api/zones/${zone.id}/playlist`, {
        items: order.map((id) => ({ itemId: id })),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function removeZone() {
    if (!confirm(`Slette sonen «${zone.name}»? Skjermene i den mister innholdet.`)) return;
    await api.del(`/api/zones/${zone.id}`);
    onChanged();
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>{zone.name}</h2>
        {isAdmin && (
          <button className="btn btn-sm btn-ghost" onClick={removeZone}>
            ✕
          </button>
        )}
      </div>
      <div className="field">
        <label htmlFor={`theme-${zone.id}`}>Tema</label>
        <select
          id={`theme-${zone.id}`}
          value={zone.theme}
          onChange={(e) => setTheme(e.target.value)}
          disabled={!isAdmin}
        >
          {Object.entries(THEME_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <label style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--txt-dim)" }}>
        Spilleliste
      </label>
      {inZone.length === 0 ? (
        <p className="empty">Ingen innhold i denne sonen ennå.</p>
      ) : (
        inZone.map((item, idx) => (
          <div className="card-row" key={item.id}>
            <span style={{ flex: 1 }}>
              {item.title || item.body.slice(0, 40) || "(uten tittel)"}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              disabled={busy || idx === 0}
              onClick={() => move(item.id, -1)}
            >
              ↑
            </button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={busy || idx === inZone.length - 1}
              onClick={() => move(item.id, 1)}
            >
              ↓
            </button>
          </div>
        ))
      )}
    </div>
  );
}
