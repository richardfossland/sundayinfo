// Easter computus (Anonymous Gregorian algorithm / Meeus-Jones-Butcher).
// Pure calendar math — the church year derives from this single date.

/** Easter Sunday (Western) for a given year, as a LOCAL date. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Strip time-of-day (local midnight). */
export function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** First Sunday of Advent: the first Sunday on or after Nov 27 (equivalently,
 * the 4th Sunday before Christmas Day) — always lands between Nov 27 and Dec 3. */
export function adventStart(year: number): Date {
  const nov27 = new Date(year, 10, 27);
  return addDays(nov27, (7 - nov27.getDay()) % 7);
}
