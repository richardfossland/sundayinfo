"use client";

/** Health badge for a screen's heartbeat (beats every 30 s). */
export function lastSeenBadge(lastSeen: string | null): { cls: string; label: string } {
  if (!lastSeen) return { cls: "badge-dim", label: "aldri sett" };
  const ageMin = (Date.now() - Date.parse(lastSeen)) / 60_000;
  if (ageMin < 2) return { cls: "badge-ok", label: "på lufta" };
  if (ageMin < 10) return { cls: "badge-warn", label: `${Math.round(ageMin)} min siden` };
  return { cls: "badge-danger", label: "frakoblet" };
}
