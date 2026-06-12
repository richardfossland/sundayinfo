"use client";

import { createBrowserClient } from "@supabase/ssr";

import { sharedCookieOptions } from "./cookies";

/** Browser Supabase client — session in cookies the server reads; the shared
 * cookie domain (when configured) spans every `*.sundaysuite.app` subdomain.
 * Also used (anon) for Realtime broadcast subscriptions on the display. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: sharedCookieOptions() },
  );
}
