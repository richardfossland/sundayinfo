"use client";

import { useEffect } from "react";

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Holder skjermen våken mens `enabled` (TV/projektor skal ikke dimme). Låsen
 * slippes av nettleseren når fanen skjules, så den tas på nytt ved retur.
 * Feiler stille der Wake Lock API ikke finnes eller nektes. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await (
          navigator as unknown as {
            wakeLock: { request: (t: "screen") => Promise<WakeLockSentinelLike> };
          }
        ).wakeLock.request("screen");
        if (cancelled) void s.release().catch(() => {});
        else sentinel = s;
      } catch {}
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
