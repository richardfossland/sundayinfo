"use client";

import { useCallback, useEffect, useState } from "react";

import AdminShell from "@/app/components/AdminShell";
import { api, errorText } from "@/lib/client/api";
import { useChurch } from "@/lib/client/useChurch";

type Member = {
  userId: string;
  email: string | null;
  role: "admin" | "editor";
  allowedZoneIds: string[] | null;
};
type Zone = { id: string; name: string };

export default function MembersPage() {
  const { me, loading, membership, select } = useChurch();
  const churchId = membership?.churchId ?? null;
  const isAdmin = membership?.role === "admin";
  const [members, setMembers] = useState<Member[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor">("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!churchId) return;
    const [m, z] = await Promise.all([
      api.get<{ members: Member[] }>(`/api/members?churchId=${churchId}`),
      api.get<{ zones: Zone[] }>(`/api/zones?churchId=${churchId}`),
    ]);
    setMembers(m.members);
    setZones(z.zones);
  }, [churchId]);

  useEffect(() => {
    if (isAdmin) load().catch(() => {});
  }, [load, isAdmin]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/members", { churchId, email: email.trim(), role });
      setEmail("");
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    if (!confirm("Fjerne denne redaktøren?")) return;
    await api.del(`/api/members/${userId}?churchId=${churchId}`);
    load();
  }

  async function setZoneRestriction(userId: string, zoneIds: string[] | null) {
    await api.patch(`/api/members/${userId}`, { churchId, allowedZoneIds: zoneIds });
    load();
  }

  if (loading || !me || !churchId) return null;
  if (!isAdmin) {
    return (
      <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
        <p className="empty">Bare administratorer kan styre medlemmer.</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell me={me} selectedChurchId={churchId} onSelectChurch={select}>
      <h1 className="pagetitle">Medlemmer</h1>
      <p className="lede">
        Inviter redaktører på e-post. Redaktører kan begrenses til bestemte soner
        (f.eks. barnelederen styrer bare barnerommet).
      </p>

      <div className="card">
        <h2>Inviter</h2>
        <form onSubmit={invite}>
          <div className="field">
            <label htmlFor="m-email">E-post</label>
            <input
              id="m-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="redaktor@menigheten.no"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="m-role">Rolle</label>
            <select id="m-role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "editor")}>
              <option value="editor">Redaktør</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-block" disabled={busy}>
            {busy ? "Inviterer …" : "Send invitasjon"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Medlemmer</h2>
        {members.map((m) => (
          <div className="card-row" key={m.userId}>
            <span style={{ flex: 1 }}>
              {m.email ?? m.userId.slice(0, 8)}
              <span className={`badge ${m.role === "admin" ? "badge-ok" : "badge-dim"}`} style={{ marginLeft: 8 }}>
                {m.role === "admin" ? "admin" : "redaktør"}
              </span>
            </span>
            {m.role === "editor" && zones.length > 1 && (
              <select
                value={m.allowedZoneIds === null ? "all" : (m.allowedZoneIds[0] ?? "all")}
                onChange={(e) =>
                  setZoneRestriction(
                    m.userId,
                    e.target.value === "all" ? null : [e.target.value],
                  )
                }
                style={{
                  background: "var(--ink)",
                  color: "var(--txt)",
                  border: "1px solid var(--ink-line-strong)",
                  borderRadius: 8,
                  padding: "4px 6px",
                  fontSize: "0.82rem",
                }}
              >
                <option value="all">Alle soner</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    Kun {z.name}
                  </option>
                ))}
              </select>
            )}
            {m.userId !== me.userId && (
              <button className="btn btn-sm btn-ghost" onClick={() => remove(m.userId)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
