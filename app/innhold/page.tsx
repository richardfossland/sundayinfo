"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import { api } from "@/lib/client/api";
import { useChurch } from "@/lib/client/useChurch";

type ItemRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  publish_at: string | null;
  expires_at: string | null;
  zoneIds: string[];
};

const TYPE_LABELS: Record<string, string> = {
  announcement: "Kunngjøring",
  verse: "Vers",
  qr: "QR",
  image: "Bilde",
};

function statusBadge(item: ItemRow): { cls: string; label: string } {
  const now = Date.now();
  if (item.expires_at && Date.parse(item.expires_at) <= now)
    return { cls: "badge-dim", label: "utløpt" };
  if (item.publish_at && Date.parse(item.publish_at) > now)
    return { cls: "badge-warn", label: "planlagt" };
  if (item.zoneIds.length === 0) return { cls: "badge-dim", label: "ikke i noen sone" };
  return { cls: "badge-ok", label: "vises" };
}

export default function ContentListPage() {
  const { me, loading, membership, select } = useChurch();
  const churchId = membership?.churchId ?? null;
  const [items, setItems] = useState<ItemRow[]>([]);

  const load = useCallback(async () => {
    if (!churchId) return;
    const data = await api.get<{ items: ItemRow[] }>(`/api/content?churchId=${churchId}`);
    setItems(data.items);
  }, [churchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Slette dette innholdet?")) return;
    await api.del(`/api/content/${id}`);
    load();
  }

  if (loading || !me) return null;

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Innhold</h1>
      <p className="lede">
        Alt har utløpsdato — skjermen viser aldri gamle plakater.
      </p>
      <Link href="/innhold/ny" className="btn btn-block" style={{ marginBottom: 14 }}>
        + Nytt innhold
      </Link>
      <div className="card">
        {items.length === 0 ? (
          <p className="empty">Ingenting ennå. Lim inn en tekst, så er du i gang!</p>
        ) : (
          items.map((item) => {
            const badge = statusBadge(item);
            return (
              <div className="card-row" key={item.id}>
                <Link href={`/innhold/${item.id}`} style={{ color: "var(--txt)", flex: 1 }}>
                  <b>{item.title || item.body.slice(0, 40) || "(uten tittel)"}</b>
                  <span style={{ color: "var(--txt-faint)", marginLeft: 8, fontSize: "0.82rem" }}>
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                </Link>
                <span className={`badge ${badge.cls}`}>{badge.label}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => remove(item.id)}>
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </AdminShell>
  );
}
