"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import ContentForm, { type ContentDraft } from "@/app/innhold/ContentForm";
import { api } from "@/lib/client/api";
import { useChurch } from "@/lib/client/useChurch";

type ItemRow = {
  id: string;
  type: ContentDraft["type"];
  title: string;
  body: string;
  payload: { reference?: string; url?: string };
  publish_at: string | null;
  expires_at: string | null;
  zoneIds: string[];
};

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditContentPage() {
  const { id } = useParams<{ id: string }>();
  const { me, loading, membership, select } = useChurch();
  const churchId = membership?.churchId ?? null;
  const [draft, setDraft] = useState<ContentDraft | null>(null);

  useEffect(() => {
    if (!churchId) return;
    api
      .get<{ items: ItemRow[] }>(`/api/content?churchId=${churchId}`)
      .then((d) => {
        const item = d.items.find((i) => i.id === id);
        if (!item) return;
        setDraft({
          id: item.id,
          type: item.type,
          title: item.title,
          bodyText: item.body,
          reference: item.payload.reference ?? "",
          url: item.type === "qr" ? (item.payload.url ?? "") : "",
          imageUrl: item.type === "image" ? (item.payload.url ?? "") : "",
          publishAt: toLocal(item.publish_at),
          expiresAt: toLocal(item.expires_at),
          zoneIds: item.zoneIds,
        });
      })
      .catch(() => {});
  }, [churchId, id]);

  if (loading || !me || !churchId) return null;

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Rediger innhold</h1>
      {draft ? <ContentForm churchId={churchId} initial={draft} /> : <p className="empty">Laster …</p>}
    </AdminShell>
  );
}
