import { describe, expect, it } from "vitest";

import {
  buildFacilities,
  formatRoomStatus,
  type SignageRoom,
} from "@/lib/display/facilities";

const TZ = "Europe/Oslo";

function room(over: Partial<SignageRoom> = {}): SignageRoom {
  return {
    resource_id: "r1",
    resource_name: "Storsalen",
    current: null,
    next: null,
    ...over,
  };
}

// 2026-05-18 summer time → Europe/Oslo is UTC+2, so 12:00Z renders as 14:00.
const cur = { title: "Bryllup", starts: "2026-05-18T12:00:00Z", ends: "2026-05-18T16:00:00Z", event_type: "bryllup" };
const nxt = { title: "Korøvelse", starts: "2026-05-18T17:00:00Z", ends: "2026-05-18T18:00:00Z", event_type: "korovelse" };

describe("formatRoomStatus", () => {
  it("renders running + next as occupied then free", () => {
    expect(formatRoomStatus(room({ current: cur, next: nxt }), TZ)).toBe(
      "Bryllup 14:00–18:00 · Ledig 19:00",
    );
  });

  it("renders running only", () => {
    expect(formatRoomStatus(room({ current: cur }), TZ)).toBe("Bryllup 14:00–18:00");
  });

  it("renders free with an upcoming booking by name", () => {
    expect(formatRoomStatus(room({ next: nxt }), TZ)).toBe("Ledig · Korøvelse 19:00");
  });

  it("renders fully free", () => {
    expect(formatRoomStatus(room(), TZ)).toBe("Ledig");
  });

  it("respects the church timezone (UTC renders the raw hour)", () => {
    expect(formatRoomStatus(room({ current: cur }), "UTC")).toBe("Bryllup 12:00–16:00");
  });

  it("falls back gracefully on a bogus timezone", () => {
    // Should not throw; the catch path slices the UTC wall clock.
    expect(formatRoomStatus(room({ current: cur }), "Not/AZone")).toContain("Bryllup");
  });
});

describe("buildFacilities", () => {
  it("maps RPC rows into render-ready rows", () => {
    const rows = [
      { resource_id: "r1", resource_name: "Storsalen", current: cur, next: nxt },
      { resource_id: "r2", resource_name: "Lillesalen", current: null, next: nxt },
    ];
    const out = buildFacilities(rows, TZ);
    expect(out).toEqual([
      { resourceId: "r1", room: "Storsalen", status: "Bryllup 14:00–18:00 · Ledig 19:00" },
      { resourceId: "r2", room: "Lillesalen", status: "Ledig · Korøvelse 19:00" },
    ]);
  });

  it("drops rooms with neither current nor next", () => {
    const rows = [{ resource_id: "r3", resource_name: "Tomt", current: null, next: null }];
    expect(buildFacilities(rows, TZ)).toEqual([]);
  });

  it("degrades to [] for non-array / garbage input", () => {
    expect(buildFacilities(null, TZ)).toEqual([]);
    expect(buildFacilities(undefined, TZ)).toEqual([]);
    expect(buildFacilities("nope", TZ)).toEqual([]);
    expect(buildFacilities({}, TZ)).toEqual([]);
  });

  it("skips malformed rows without throwing", () => {
    const rows = [
      { resource_id: 123, resource_name: "bad id type", current: cur },
      { resource_name: "missing id", current: cur },
      { resource_id: "ok", resource_name: "Salen", current: cur },
    ];
    const out = buildFacilities(rows, TZ);
    expect(out).toEqual([{ resourceId: "ok", room: "Salen", status: "Bryllup 14:00–18:00" }]);
  });

  it("ignores partial booking objects (missing fields)", () => {
    const rows = [
      { resource_id: "r1", resource_name: "Salen", current: { title: "Mangler tider" }, next: null },
    ];
    // current is not a valid booking → treated as null → room dropped (no next).
    expect(buildFacilities(rows, TZ)).toEqual([]);
  });
});
