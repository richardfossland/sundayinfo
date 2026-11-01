"use client";

import { useFullscreenKey } from "./useFullscreenKey";
import { useHideCursor } from "./useHideCursor";
import { useWakeLock } from "./useWakeLock";

/** Monteres på selve skjermen (TV/projektor): skjuler musepekeren etter noen
 * sekunder, holder skjermen våken og lar F veksle fullskjerm. Rendrer ingenting. */
export function SkjermVisning() {
  useHideCursor(true);
  useWakeLock(true);
  useFullscreenKey(true);
  return null;
}
