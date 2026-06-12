import { describe, expect, it } from "vitest";

import { COLOR_HEX, liturgicalAccent, seasonFor } from "@/lib/churchyear/calendar";
import { adventStart, easterSunday } from "@/lib/churchyear/computus";

describe("easterSunday", () => {
  it("matches known Easter dates", () => {
    expect(easterSunday(2024).toDateString()).toBe(new Date(2024, 2, 31).toDateString());
    expect(easterSunday(2025).toDateString()).toBe(new Date(2025, 3, 20).toDateString());
    expect(easterSunday(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(easterSunday(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
  });
});

describe("adventStart", () => {
  it("is always a Sunday between Nov 27 and Dec 3", () => {
    for (let year = 2024; year <= 2035; year++) {
      const d = adventStart(year);
      expect(d.getDay()).toBe(0);
      const nov27 = new Date(year, 10, 27).getTime();
      const dec3 = new Date(year, 11, 3).getTime();
      expect(d.getTime()).toBeGreaterThanOrEqual(nov27);
      expect(d.getTime()).toBeLessThanOrEqual(dec3);
    }
  });
});

describe("seasonFor", () => {
  it("classifies the major seasons of 2026", () => {
    expect(seasonFor(new Date(2026, 11, 25)).name).toBe("Juletiden");
    expect(seasonFor(new Date(2026, 0, 2)).name).toBe("Juletiden");
    expect(seasonFor(new Date(2026, 11, 6)).name).toBe("Adventstiden");
    // Easter 2026 = April 5 → Ash Wednesday Feb 18, Palm Sunday Mar 29.
    expect(seasonFor(new Date(2026, 2, 1)).name).toBe("Fastetiden");
    expect(seasonFor(new Date(2026, 3, 3)).name).toBe("Den stille uke"); // Good Friday
    expect(seasonFor(new Date(2026, 3, 5)).name).toBe("Påsketiden");
    expect(seasonFor(new Date(2026, 3, 15)).name).toBe("Påsketiden");
    // Pentecost 2026 = May 24.
    expect(seasonFor(new Date(2026, 4, 24)).name).toBe("Pinse");
    expect(seasonFor(new Date(2026, 4, 25)).name).toBe("Pinse");
    expect(seasonFor(new Date(2026, 6, 12)).name).toBe("Treenighetstiden");
    expect(seasonFor(new Date(2026, 1, 1)).name).toBe("Åpenbaringstiden");
  });

  it("colors follow the season", () => {
    expect(seasonFor(new Date(2026, 11, 6)).color).toBe("fiolett");
    expect(seasonFor(new Date(2026, 11, 25)).color).toBe("hvit");
    expect(seasonFor(new Date(2026, 4, 24)).color).toBe("roed");
    expect(seasonFor(new Date(2026, 6, 12)).color).toBe("groenn");
  });

  it("liturgicalAccent maps to hex", () => {
    expect(liturgicalAccent(new Date(2026, 11, 6))).toBe(COLOR_HEX.fiolett);
  });
});
