import "server-only";

import { buildServiceProgram, type ServiceProgram } from "@/lib/display/serviceplan";
import { createPublicServiceClient } from "@/lib/supabase/service";

// SundayPlan is a sibling app in the SAME Supabase project. It owns the `public`
// schema (tenancy + service planning) and exposes
// `public.service_signage_board(p_church_id, p_now)` — the current/next PUBLISHED
// service with its order-of-service. SundayInfo reads it through the service-role
// `public` client to render a "dagens gudstjeneste" slide.
//
// Resilience contract: the RPC may be ABSENT (separate deploy / not yet migrated)
// or return nothing. On ANY failure we degrade to null — never throw, never break
// signage. Mirrors lib/server/booking.ts.

/** Fetch the church's current/next service program, or null on any failure. */
export async function fetchServiceProgram(
  churchId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<ServiceProgram | null> {
  try {
    // The `public` (SundayPlan tenancy) schema; the service client bypasses RLS
    // and the function is church-scoped by the id we pass (server-verified).
    const db = createPublicServiceClient();
    const { data, error } = await db.rpc("service_signage_board", {
      p_church_id: churchId,
      p_now: now.toISOString(),
    });
    if (error) {
      // Missing function / no grant / not yet migrated all surface here. This
      // is expected until SundayPlan migration 0026 is applied in prod.
      return null;
    }
    return buildServiceProgram(data, timezone);
  } catch {
    return null;
  }
}
