// "Dagens gudstjeneste" — pure now/next formatting for the optional SundayPlan
// service feed. SundayPlan is a sibling app owning the `public` schema in the
// SAME Supabase project; SundayInfo consumes its `public.service_signage_board`
// RPC and renders today's / next service order-of-service. Everything here is
// pure (no I/O), so it unit-tests cleanly and runs on the display's local clock
// like the rest of `lib/display`. Mirrors `lib/display/facilities.ts`.

/** A SundayPlan order-of-service item kind (public.service_item.kind). */
export type ServiceItemKind =
  | "welcome"
  | "song"
  | "scripture"
  | "sermon"
  | "announcement"
  | "gap";

/** One order-of-service row as the RPC returns it (snake_case JSON). */
export type SignageServiceItem = {
  position: number;
  label: string;
  kind: string;
  duration_min: number;
};

/** The service the RPC returns (or null/absent when none is upcoming). */
export type SignageService = {
  service_id: string;
  name: string;
  starts: string; // ISO instant
  items: SignageServiceItem[];
};

/** What the snapshot carries + the display renders: a stable, JSON-plain shape. */
export type ServiceProgram = {
  /** Service name, e.g. "Høymesse". */
  title: string;
  /** "HH:MM" start in the church's timezone. */
  time: string;
  rows: { label: string; kind: ServiceItemKind }[];
};

const KINDS: ServiceItemKind[] = [
  "welcome",
  "song",
  "scripture",
  "sermon",
  "announcement",
  "gap",
];

/** "HH:MM" in the church's timezone for an ISO instant. */
function clock(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    // Bad tz or unparseable instant — fall back to the UTC wall-clock slice.
    return new Date(iso).toISOString().slice(11, 16);
  }
}

/** Coerce an unknown kind to a known one; anything unexpected reads as info. */
function asKind(k: unknown): ServiceItemKind {
  return typeof k === "string" && (KINDS as string[]).includes(k)
    ? (k as ServiceItemKind)
    : "announcement";
}

/** Map the raw RPC payload into a render-ready service program. Returns null for
 *  no service / empty order / garbage input, so callers degrade to nothing. */
export function buildServiceProgram(
  raw: unknown,
  timezone: string,
): ServiceProgram | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<SignageService>;
  if (typeof s.name !== "string" || typeof s.starts !== "string") return null;
  const itemsRaw = Array.isArray(s.items) ? s.items : [];
  const rows = itemsRaw
    .filter(
      (it): it is SignageServiceItem =>
        !!it &&
        typeof it === "object" &&
        typeof (it as SignageServiceItem).label === "string",
    )
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((it) => ({ label: it.label, kind: asKind(it.kind) }));
  if (rows.length === 0) return null; // no order-of-service to show
  return { title: s.name, time: clock(s.starts, timezone), rows };
}
