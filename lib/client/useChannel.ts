"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Handler = (event: string, payload: Record<string, unknown>) => void;

/** Subscribe to a Supabase Realtime channel and invoke `onEvent` for every
 * broadcast event on it. Resubscribes when the topic changes. The handler is
 * kept in a ref so consumers don't need to memoise it. Wrapped in try/catch:
 * on TV browsers where WebSockets fail, the display's poll loop covers it. */
export function useChannel(topic: string | null, onEvent: Handler) {
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    if (!topic) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    try {
      const supabase = createClient();
      const channel = supabase.channel(topic, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "*" }, (msg) => {
        handlerRef.current(
          (msg.event as string) ?? "",
          (msg.payload as Record<string, unknown>) ?? {},
        );
      });
      channel.subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      // realtime is an enhancement; polling is the source of truth
      return;
    }
  }, [topic]);
}
