import { describe, expect, it } from "vitest";

import {
  formatCountdown,
  resolveMode,
  upcomingOccurrences,
} from "@/lib/display/mode";
import type { SnapshotEvent } from "@/lib/types";

function service(over: Partial<SnapshotEvent> = {}): SnapshotEvent {
  return {
    id: "e1",
    title: "Gudstjeneste",
    kind: "service",
    weekday: 0, // Sunday
    date: null,
    startTime: "11:00:00",
    durationMinutes: 90,
    program: [],
    preWindowMin: 60,
    postWindowMin: 45,
    ...over,
  };
}

// 2026-06-14 is a Sunday.
const sunday = (h: number, m = 0) => new Date(2026, 5, 14, h, m);

describe("resolveMode", () => {
  it("is weekly outside every window", () => {
    expect(resolveMode([service()], sunday(8, 0)).mode).toBe("weekly");
    expect(resolveMode([service()], new Date(2026, 5, 16, 11, 0)).mode).toBe("weekly");
  });

  it("walks pre → in → post through a Sunday service", () => {
    expect(resolveMode([service()], sunday(10, 30)).mode).toBe("pre_service");
    expect(resolveMode([service()], sunday(11, 0)).mode).toBe("in_service");
    expect(resolveMode([service()], sunday(12, 29)).mode).toBe("in_service");
    expect(resolveMode([service()], sunday(12, 45)).mode).toBe("post_service");
    expect(resolveMode([service()], sunday(13, 20)).mode).toBe("weekly");
  });

  it("exposes the driving event and its start", () => {
    const r = resolveMode([service()], sunday(10, 30));
    expect(r.event?.title).toBe("Gudstjeneste");
    expect(r.start?.getHours()).toBe(11);
  });

  it("handles one-off dated events", () => {
    const concert = service({
      id: "e2",
      title: "Konsert",
      weekday: null,
      date: "2026-06-17",
      startTime: "19:30:00",
    });
    expect(resolveMode([concert], new Date(2026, 5, 17, 19, 0)).mode).toBe(
      "pre_service",
    );
    expect(resolveMode([concert], new Date(2026, 5, 18, 19, 0)).mode).toBe("weekly");
  });

  it("in_service wins over an overlapping pre window", () => {
    const evening = service({ id: "e3", title: "Kveld", startTime: "12:30:00" });
    // 12:00: morning service (11:00+90) is in_service; evening (12:30) is pre.
    const r = resolveMode([service(), evening], sunday(12, 0));
    expect(r.mode).toBe("in_service");
    expect(r.event?.id).toBe("e1");
  });

  it("covers windows that started yesterday (late-night services)", () => {
    const late = service({
      id: "e4",
      weekday: 6, // Saturday
      startTime: "23:30:00",
      durationMinutes: 60,
      postWindowMin: 60,
    });
    // Sunday 00:15 — Saturday's 23:30 service still running.
    expect(resolveMode([late], new Date(2026, 5, 14, 0, 15)).mode).toBe("in_service");
  });

  it("reports the next upcoming occurrence", () => {
    const r = resolveMode([service()], new Date(2026, 5, 10, 12, 0)); // Wednesday
    expect(r.next?.start.getDay()).toBe(0);
    expect(r.next?.start.getHours()).toBe(11);
  });
});

describe("upcomingOccurrences", () => {
  it("expands recurring events across the coming week, sorted", () => {
    const wed = service({ id: "e5", title: "Bønn", weekday: 3, startTime: "19:00:00" });
    const list = upcomingOccurrences([service(), wed], new Date(2026, 5, 15, 9, 0)); // Monday
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].event.id).toBe("e5"); // Wednesday before next Sunday
    const times = list.map((o) => o.start.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("formatCountdown", () => {
  it("formats minutes and hours in Norwegian", () => {
    expect(formatCountdown(30_000)).toBe("under 1 min");
    expect(formatCountdown(14 * 60_000)).toBe("14 min");
    expect(formatCountdown(2 * 3_600_000)).toBe("2 t");
    expect(formatCountdown(2 * 3_600_000 + 14 * 60_000)).toBe("2 t 14 min");
  });
});
