import { describe, expect, it } from "vitest";

import { buildServiceProgram } from "@/lib/display/serviceplan";

const TZ = "Europe/Oslo";

// 2026-05-18 summer time → Europe/Oslo is UTC+2, so 09:00Z renders as 11:00.
const base = {
  service_id: "s1",
  name: "Høymesse",
  starts: "2026-05-18T09:00:00Z",
  items: [
    { position: 2, label: "Lovsang", kind: "song", duration_min: 8 },
    { position: 1, label: "Velkomst", kind: "welcome", duration_min: 3 },
    { position: 3, label: "Preken", kind: "sermon", duration_min: 20 },
  ],
};

describe("buildServiceProgram", () => {
  it("maps the RPC payload, ordering items by position", () => {
    expect(buildServiceProgram(base, TZ)).toEqual({
      title: "Høymesse",
      time: "11:00",
      rows: [
        { label: "Velkomst", kind: "welcome" },
        { label: "Lovsang", kind: "song" },
        { label: "Preken", kind: "sermon" },
      ],
    });
  });

  it("respects the church timezone (UTC renders the raw hour)", () => {
    expect(buildServiceProgram(base, "UTC")?.time).toBe("09:00");
  });

  it("falls back gracefully on a bogus timezone", () => {
    // Should not throw; the catch path slices the UTC wall clock.
    expect(buildServiceProgram(base, "Not/AZone")?.time).toBe("09:00");
  });

  it("coerces an unknown item kind to a safe default", () => {
    const out = buildServiceProgram(
      { ...base, items: [{ position: 1, label: "Noe", kind: "weird", duration_min: 0 }] },
      TZ,
    );
    expect(out?.rows).toEqual([{ label: "Noe", kind: "announcement" }]);
  });

  it("returns null for no service / empty order / garbage", () => {
    expect(buildServiceProgram(null, TZ)).toBeNull();
    expect(buildServiceProgram(undefined, TZ)).toBeNull();
    expect(buildServiceProgram("nope", TZ)).toBeNull();
    expect(buildServiceProgram({}, TZ)).toBeNull();
    expect(buildServiceProgram({ ...base, items: [] }, TZ)).toBeNull();
  });

  it("skips malformed item rows without throwing", () => {
    const out = buildServiceProgram(
      {
        ...base,
        items: [
          { position: 1, label: "Ok", kind: "song", duration_min: 0 },
          { position: 2, kind: "song" }, // missing label
          "garbage",
        ],
      },
      TZ,
    );
    expect(out?.rows).toEqual([{ label: "Ok", kind: "song" }]);
  });
});
