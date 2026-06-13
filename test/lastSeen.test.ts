import { describe, expect, it } from "vitest";

import {
  deviceLabel,
  isOnline,
  lastSeenAgo,
  lastSeenBadge,
} from "@/lib/client/lastSeen";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("lastSeenBadge", () => {
  it("is on-air within 2 minutes", () => {
    expect(lastSeenBadge(ago(30_000)).cls).toBe("badge-ok");
  });
  it("warns between 2 and 10 minutes", () => {
    expect(lastSeenBadge(ago(5 * 60_000)).cls).toBe("badge-warn");
  });
  it("is offline past 10 minutes", () => {
    expect(lastSeenBadge(ago(20 * 60_000)).cls).toBe("badge-danger");
  });
  it("handles never-seen", () => {
    expect(lastSeenBadge(null).cls).toBe("badge-dim");
  });
});

describe("isOnline", () => {
  it("true within the live window", () => {
    expect(isOnline(ago(60_000))).toBe(true);
  });
  it("false when stale", () => {
    expect(isOnline(ago(5 * 60_000))).toBe(false);
  });
  it("false when never seen", () => {
    expect(isOnline(null)).toBe(false);
  });
});

describe("lastSeenAgo", () => {
  it("seconds", () => {
    expect(lastSeenAgo(ago(10_000))).toMatch(/sek siden/);
  });
  it("minutes", () => {
    expect(lastSeenAgo(ago(3 * 60_000))).toMatch(/min siden/);
  });
  it("hours", () => {
    expect(lastSeenAgo(ago(2 * 3_600_000))).toMatch(/t siden/);
  });
  it("days", () => {
    expect(lastSeenAgo(ago(3 * 86_400_000))).toMatch(/døgn siden/);
  });
  it("never seen", () => {
    expect(lastSeenAgo(null)).toBe("aldri sett");
  });
});

describe("deviceLabel", () => {
  it("parses ChromeOS + Chrome", () => {
    const ua =
      "Mozilla/5.0 (X11; CrOS x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(deviceLabel(ua)).toBe("ChromeOS · Chrome");
  });
  it("parses Android Chrome (not mislabelled Safari)", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
    expect(deviceLabel(ua)).toBe("Android · Chrome");
  });
  it("parses iOS Safari", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(deviceLabel(ua)).toBe("iOS · Safari");
  });
  it("parses Windows Edge (not Chrome)", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 Edg/120";
    expect(deviceLabel(ua)).toBe("Windows · Edge");
  });
  it("falls back for empty/unknown", () => {
    expect(deviceLabel(null)).toBe("Ukjent enhet");
    expect(deviceLabel("curl/8.0")).toBe("Ukjent enhet");
  });
});
