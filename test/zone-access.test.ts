import { describe, expect, it } from "vitest";

import {
  AuthError,
  canTouchItem,
  canTouchZone,
  requireItemZoneAccess,
  type Membership,
} from "@/lib/server/auth";

const admin: Membership = { churchId: "c1", role: "admin", allowedZoneIds: null };
const unrestricted: Membership = {
  churchId: "c1",
  role: "editor",
  allowedZoneIds: null,
};
const restricted: Membership = {
  churchId: "c1",
  role: "editor",
  allowedZoneIds: ["zA", "zB"],
};

describe("canTouchZone", () => {
  it("admins and unrestricted editors may touch any zone (and church-wide)", () => {
    expect(canTouchZone(admin, "zX")).toBe(true);
    expect(canTouchZone(admin, null)).toBe(true);
    expect(canTouchZone(unrestricted, "zX")).toBe(true);
    expect(canTouchZone(unrestricted, null)).toBe(true);
  });

  it("restricted editors are limited to their zones and denied church-wide", () => {
    expect(canTouchZone(restricted, "zA")).toBe(true);
    expect(canTouchZone(restricted, "zC")).toBe(false);
    expect(canTouchZone(restricted, null)).toBe(false);
  });
});

describe("canTouchItem", () => {
  it("admins and unrestricted editors may touch any item", () => {
    expect(canTouchItem(admin, ["zX", "zY"])).toBe(true);
    expect(canTouchItem(admin, [])).toBe(true);
    expect(canTouchItem(unrestricted, ["zX"])).toBe(true);
    expect(canTouchItem(unrestricted, [])).toBe(true);
  });

  it("a restricted editor may touch an item only when ALL its zones are allowed", () => {
    expect(canTouchItem(restricted, ["zA"])).toBe(true);
    expect(canTouchItem(restricted, ["zA", "zB"])).toBe(true);
    // shared into a zone the editor does not control → denied
    expect(canTouchItem(restricted, ["zA", "zC"])).toBe(false);
    expect(canTouchItem(restricted, ["zC"])).toBe(false);
  });

  it("an orphan item (no zones) is church-wide → denied for restricted editors", () => {
    expect(canTouchItem(restricted, [])).toBe(false);
  });
});

describe("requireItemZoneAccess", () => {
  it("throws a 403 zone_forbidden when the item escapes the editor's zones", () => {
    expect(() => requireItemZoneAccess(restricted, ["zC"])).toThrow(AuthError);
    try {
      requireItemZoneAccess(restricted, ["zC"]);
    } catch (e) {
      expect((e as AuthError).status).toBe(403);
      expect((e as AuthError).message).toBe("zone_forbidden");
    }
  });

  it("does not throw for allowed items", () => {
    expect(() => requireItemZoneAccess(restricted, ["zA", "zB"])).not.toThrow();
    expect(() => requireItemZoneAccess(admin, [])).not.toThrow();
  });
});
