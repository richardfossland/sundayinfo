"use client";

import { useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import ContentForm, { EMPTY_DRAFT } from "@/app/innhold/ContentForm";
import { api } from "@/lib/client/api";
import { useChurch } from "@/lib/client/useChurch";

export default function NewContentPage() {
  const { me, loading, membership, select } = useChurch();
  const churchId = membership?.churchId ?? null;
  const [vipps, setVipps] = useState<string | null>(null);

  useEffect(() => {
    if (!churchId) return;
    api
      .get<{ vippsNumber: string | null }>(`/api/settings?churchId=${churchId}`)
      .then((d) => setVipps(d.vippsNumber))
      .catch(() => {});
  }, [churchId]);

  if (loading || !me || !churchId) return null;

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Nytt innhold</h1>
      <ContentForm churchId={churchId} initial={EMPTY_DRAFT} vippsNumber={vipps} />
    </AdminShell>
  );
}
