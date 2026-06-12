import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function makeClient(schema: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema },
  });
}

/** Service-role client defaulting to the dedicated `info` schema — SERVER
 * ONLY. Bypasses RLS; the `server-only` guard keeps it out of client bundles.
 * Every state-changing API route uses this. */
export function createServiceClient() {
  return makeClient("info");
}

/** Service-role client against `public` — for the shared SundayPlan tenancy
 * tables (church, church_member) that SundayInfo reuses instead of owning. */
export function createPublicServiceClient() {
  return makeClient("public");
}
