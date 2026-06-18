// Norwegian church-year calendar (Den norske kirke), simplified to the level a
// signage display needs: which season is it, what is it called, and which
// liturgical color should theme the screen. Derived entirely from the Easter
// computus + fixed dates — works offline forever.

import { addDays, adventStart, dateOnly, easterSunday } from "./computus";

export type LiturgicalColor = "fiolett" | "hvit" | "groenn" | "roed";

export type ChurchSeason = {
  /** Norwegian display name, e.g. "Adventstiden". */
  name: string;
  color: LiturgicalColor;
};

/** Liturgical color → screen accent (hex). Tuned to read well on the light
 * `liturgical` display theme. */
export const COLOR_HEX: Record<LiturgicalColor, string> = {
  fiolett: "#6b4c9a",
  hvit: "#d4a23a", // white feasts use the suite gold (deep) as visible accent
  groenn: "#3e7a4e",
  roed: "#b33a3a",
};

/** The church-year season for a LOCAL calendar date. */
export function seasonFor(date: Date): ChurchSeason {
  const d = dateOnly(date);
  const year = d.getFullYear();
  const easter = easterSunday(year);

  const within = (from: Date, to: Date) => d >= dateOnly(from) && d <= dateOnly(to);

  // Christmas season spills across New Year: check both years' boundaries.
  const adventThis = adventStart(year);
  if (within(new Date(year, 0, 1), new Date(year, 0, 5))) {
    return { name: "Juletiden", color: "hvit" };
  }
  if (d >= dateOnly(new Date(year, 11, 24))) {
    return { name: "Juletiden", color: "hvit" };
  }
  if (d >= dateOnly(adventThis)) {
    return { name: "Adventstiden", color: "fiolett" };
  }

  // Lent: Ash Wednesday (Easter − 46) through Easter Eve.
  const ashWednesday = addDays(easter, -46);
  const palmSunday = addDays(easter, -7);
  if (within(palmSunday, addDays(easter, -1))) {
    return { name: "Den stille uke", color: "fiolett" };
  }
  if (within(ashWednesday, addDays(easter, -8))) {
    return { name: "Fastetiden", color: "fiolett" };
  }

  // Easter season: Easter Sunday until the eve of Pentecost (Easter + 49).
  const pentecost = addDays(easter, 49);
  if (within(easter, addDays(pentecost, -1))) {
    return { name: "Påsketiden", color: "hvit" };
  }
  // Pentecost Sunday + Monday.
  if (within(pentecost, addDays(pentecost, 1))) {
    return { name: "Pinse", color: "roed" };
  }
  if (d > dateOnly(addDays(pentecost, 1))) {
    return { name: "Treenighetstiden", color: "groenn" };
  }

  // Between Jan 6 and Ash Wednesday: Epiphany season.
  return { name: "Åpenbaringstiden", color: "groenn" };
}

/** Accent hex for a date — what the `liturgical` zone theme uses. */
export function liturgicalAccent(date: Date): string {
  return COLOR_HEX[seasonFor(date).color];
}
