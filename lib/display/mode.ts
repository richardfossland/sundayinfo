// Auto-mode engine — PURE functions on the display's local clock, so the
// screen keeps flipping modes correctly even when fully offline. The server
// only supplies the schedule; all time arithmetic happens here, in the
// device's local timezone (TVs in the building share the church's timezone).

import type { DisplayMode, SnapshotEvent } from "@/lib/types";

export type ModeResolution = {
  mode: DisplayMode;
  /** The event driving the current mode (absent in `weekly`). */
  event?: SnapshotEvent;
  /** Start of the driving occurrence. */
  start?: Date;
  /** End of the driving occurrence (start + duration). */
  end?: Date;
  /** Next upcoming occurrence within 7 days (countdown + "neste"). */
  next?: { event: SnapshotEvent; start: Date };
};

function parseTime(t: string): { h: number; m: number; s: number } {
  const [h = 0, m = 0, s = 0] = t.split(":").map((x) => parseInt(x, 10));
  return { h, m, s };
}

/** The event's occurrence starting on the calendar day of `day` (local),
 * or null if it doesn't occur that day. */
function occurrenceOn(event: SnapshotEvent, day: Date): Date | null {
  if (event.weekday !== null) {
    if (day.getDay() !== event.weekday) return null;
  } else if (event.date !== null) {
    const [y, mo, d] = event.date.split("-").map((x) => parseInt(x, 10));
    if (day.getFullYear() !== y || day.getMonth() !== mo - 1 || day.getDate() !== d)
      return null;
  } else {
    return null;
  }
  const { h, m, s } = parseTime(event.startTime);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, s);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Resolve what the screen should show right now. Window per occurrence:
 * [start − preWindowMin, start + duration + postWindowMin]. When several
 * events overlap, `in_service` wins over `pre_service` wins over
 * `post_service`; ties go to the occurrence starting soonest/most recently. */
export function resolveMode(events: SnapshotEvent[], now: Date): ModeResolution {
  type Candidate = { mode: DisplayMode; event: SnapshotEvent; start: Date; end: Date };
  const candidates: Candidate[] = [];
  let next: { event: SnapshotEvent; start: Date } | undefined;

  for (const event of events) {
    // Windows can stretch up to ±12 h around a start, so occurrences starting
    // yesterday may still cover `now`; scan a week ahead for the countdown.
    for (let offset = -1; offset <= 7; offset++) {
      const start = occurrenceOn(event, addDays(now, offset));
      if (!start) continue;
      const end = new Date(start.getTime() + event.durationMinutes * 60_000);
      const preFrom = new Date(start.getTime() - event.preWindowMin * 60_000);
      const postTo = new Date(end.getTime() + event.postWindowMin * 60_000);

      if (now >= start && now < end) {
        candidates.push({ mode: "in_service", event, start, end });
      } else if (now >= preFrom && now < start) {
        candidates.push({ mode: "pre_service", event, start, end });
      } else if (now >= end && now < postTo) {
        candidates.push({ mode: "post_service", event, start, end });
      }

      if (start > now && (!next || start < next.start)) {
        next = { event, start };
      }
    }
  }

  const RANK: Record<DisplayMode, number> = {
    in_service: 0,
    pre_service: 1,
    post_service: 2,
    weekly: 3,
  };
  candidates.sort((a, b) => {
    if (RANK[a.mode] !== RANK[b.mode]) return RANK[a.mode] - RANK[b.mode];
    // Same mode: the occurrence whose start is closest to now wins.
    return (
      Math.abs(a.start.getTime() - now.getTime()) -
      Math.abs(b.start.getTime() - now.getTime())
    );
  });

  const top = candidates[0];
  if (!top) return { mode: "weekly", next };
  return { mode: top.mode, event: top.event, start: top.start, end: top.end, next };
}

/** All occurrences in the next `days` days, soonest first — drives the
 * weekly-program slide and the "Neste:" footer. */
export function upcomingOccurrences(
  events: SnapshotEvent[],
  now: Date,
  days = 7,
): { event: SnapshotEvent; start: Date }[] {
  const out: { event: SnapshotEvent; start: Date }[] = [];
  for (const event of events) {
    for (let offset = 0; offset <= days; offset++) {
      const start = occurrenceOn(event, addDays(now, offset));
      if (start && start > now) out.push({ event, start });
    }
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/** "2 t 14 min" / "14 min" / "under 1 min" — for the countdown slide. */
export function formatCountdown(ms: number): string {
  if (ms < 60_000) return "under 1 min";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} t` : `${h} t ${m} min`;
}

const WEEKDAYS_NO = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

export function weekdayName(weekday: number): string {
  return WEEKDAYS_NO[((weekday % 7) + 7) % 7];
}

/** "HH:MM" from "HH:MM:SS". */
export function shortTime(t: string): string {
  return t.slice(0, 5);
}
