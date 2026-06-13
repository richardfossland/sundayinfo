// "Fasiliteter i bruk" — pure now/next formatting for the optional booking
// (SundayBooking) signage feed. The booking app is an OPTIONAL sibling living
// in the same Supabase project; SundayInfo consumes its `booking.signage_board`
// RPC and renders a room board. Everything here is pure (no I/O), so it unit
// tests cleanly and runs on the display's local clock like the rest of
// `lib/display`.

/** One room's current + next booking, as the RPC returns it (snake_case JSON). */
export type SignageBooking = {
  title: string;
  starts: string; // ISO instant
  ends: string; // ISO instant
  event_type: string | null;
};

export type SignageRoom = {
  resource_id: string;
  resource_name: string;
  current: SignageBooking | null;
  next: SignageBooking | null;
};

/** What the snapshot carries + the display renders: a stable, JSON-plain row. */
export type FacilitiesRoom = {
  resourceId: string;
  room: string;
  /** Rendered one-liner, e.g. "Bryllup 14:00–18:00 · Ledig 19:00" or "Ledig". */
  status: string;
};

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

/** A booking phrase: "Bryllup 14:00–18:00". Uses an en-dash like the contract. */
function phrase(b: SignageBooking, timezone: string): string {
  return `${b.title} ${clock(b.starts, timezone)}–${clock(b.ends, timezone)}`;
}

/** Render one room's now/next into the Norwegian-first status line.
 *  - running + upcoming:  "Bryllup 14:00–18:00 · Ledig 19:00"
 *  - running only:        "Bryllup 14:00–18:00"
 *  - free + upcoming:     "Ledig · Korøvelse 19:00"
 *  - nothing:             "Ledig" */
export function formatRoomStatus(room: SignageRoom, timezone: string): string {
  const parts: string[] = [];
  if (room.current) {
    parts.push(phrase(room.current, timezone));
  } else {
    parts.push("Ledig");
  }
  if (room.next) {
    // When something is running now, the "next" tail reads as availability;
    // when the room is free now, it names what's coming up.
    parts.push(
      room.current
        ? `Ledig ${clock(room.next.starts, timezone)}`
        : `${room.next.title} ${clock(room.next.starts, timezone)}`,
    );
  }
  return parts.join(" · ");
}

/** Map the raw RPC rows into render-ready facility rows. Rooms with neither a
 *  current nor a next booking are dropped (nothing to show). Returns [] for
 *  empty/garbage input so callers can degrade to nothing safely. */
export function buildFacilities(
  rows: unknown,
  timezone: string,
): FacilitiesRoom[] {
  if (!Array.isArray(rows)) return [];
  const out: FacilitiesRoom[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<SignageRoom>;
    if (typeof r.resource_id !== "string" || typeof r.resource_name !== "string") {
      continue;
    }
    const current = isBooking(r.current) ? r.current : null;
    const next = isBooking(r.next) ? r.next : null;
    if (!current && !next) continue; // free with nothing upcoming — omit
    out.push({
      resourceId: r.resource_id,
      room: r.resource_name,
      status: formatRoomStatus(
        { resource_id: r.resource_id, resource_name: r.resource_name, current, next },
        timezone,
      ),
    });
  }
  return out;
}

function isBooking(v: unknown): v is SignageBooking {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as SignageBooking).title === "string" &&
    typeof (v as SignageBooking).starts === "string" &&
    typeof (v as SignageBooking).ends === "string"
  );
}
