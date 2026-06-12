"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Me } from "@/lib/client/useChurch";

const TABS = [
  { href: "/", label: "Hjem", icon: "⌂" },
  { href: "/innhold", label: "Innhold", icon: "▤" },
  { href: "/program", label: "Program", icon: "♪" },
  { href: "/soner", label: "Soner", icon: "▦" },
  { href: "/skjermer", label: "Skjermer", icon: "▣" },
] as const;

export default function AdminShell({
  children,
  me,
  selectedChurchId,
  onSelectChurch,
}: {
  children: React.ReactNode;
  me: Me | null;
  selectedChurchId: string | null;
  onSelectChurch?: (id: string) => void;
}) {
  const pathname = usePathname();
  const memberships = me?.memberships ?? [];

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="brand">
          Sunday<em>Info</em>
        </Link>
        {memberships.length > 1 && onSelectChurch ? (
          <select
            value={selectedChurchId ?? ""}
            onChange={(e) => onSelectChurch(e.target.value)}
            style={{
              background: "var(--ink)",
              color: "var(--txt)",
              border: "1px solid var(--ink-line-strong)",
              borderRadius: 8,
              padding: "6px 10px",
            }}
          >
            {memberships.map((m) => (
              <option key={m.churchId} value={m.churchId}>
                {m.churchName}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ color: "var(--txt-dim)", fontSize: "0.9rem" }}>
            {memberships[0]?.churchName ?? ""}
          </span>
        )}
      </div>
      {children}
      <nav className="tabs">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={
              t.href === "/" ? (pathname === "/" ? "active" : "") :
              pathname.startsWith(t.href) ? "active" : ""
            }
          >
            <span className="ticon">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
