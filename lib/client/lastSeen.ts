"use client";

/** Health badge for a screen's heartbeat (beats every 30 s). */
export function lastSeenBadge(lastSeen: string | null): { cls: string; label: string } {
  if (!lastSeen) return { cls: "badge-dim", label: "aldri sett" };
  const ageMin = (Date.now() - Date.parse(lastSeen)) / 60_000;
  if (ageMin < 2) return { cls: "badge-ok", label: "på lufta" };
  if (ageMin < 10) return { cls: "badge-warn", label: `${Math.round(ageMin)} min siden` };
  return { cls: "badge-danger", label: "frakoblet" };
}

/** True when a screen has beaten within the live window (~2 heartbeats). */
export function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - Date.parse(lastSeen) < 2 * 60_000;
}

/** A precise "last seen N ago" string for the cockpit. */
export function lastSeenAgo(lastSeen: string | null): string {
  if (!lastSeen) return "aldri sett";
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(lastSeen)) / 1000));
  if (sec < 60) return `${sec} sek siden`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min siden`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} t siden`;
  return `${Math.round(hrs / 24)} døgn siden`;
}

/** Boil a user-agent string down to a friendly device/browser label. */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "Ukjent enhet";
  const s = ua;
  const os =
    /Android/i.test(s) ? "Android"
    : /iPhone|iPad|iPod/i.test(s) ? "iOS"
    : /CrOS/i.test(s) ? "ChromeOS"
    : /Windows/i.test(s) ? "Windows"
    : /Mac OS X|Macintosh/i.test(s) ? "Mac"
    : /Linux/i.test(s) ? "Linux"
    : "";
  const browser =
    /Edg\//i.test(s) ? "Edge"
    : /OPR\/|Opera/i.test(s) ? "Opera"
    : /Firefox\//i.test(s) ? "Firefox"
    : /Chrome\//i.test(s) ? "Chrome"
    : /Safari\//i.test(s) ? "Safari"
    : "";
  const label = [os, browser].filter(Boolean).join(" · ");
  return label || "Ukjent enhet";
}
