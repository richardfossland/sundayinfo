import "server-only";

import { buildFacilities, type FacilitiesRoom } from "@/lib/display/facilities";
import { createServiceClient } from "@/lib/supabase/service";

// SundayBooking is an OPTIONAL sibling app in the SAME Supabase project. It owns
// the `booking` schema and exposes `booking.signage_board(p_church_id, p_now)`
// (current + next signage-flagged, approved booking per room). SundayInfo reads
// it through the service-role client to render a "fasiliteter i bruk" board.
//
// Resilience contract: the booking schema may be ABSENT or not exposed in the
// dashboard (it's a separate deploy). If the RPC is missing/unreachable for ANY
// reason we degrade to an empty board — never throw, never break signage.

/** Call booking.signage_board for a church and render room status lines.
 *  Returns [] on any failure (schema/RPC absent, unexposed, error). */
export async function fetchFacilities(
  churchId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<FacilitiesRoom[]> {
  try {
    // Override the default `info` schema; the service client bypasses RLS and
    // the function is church-scoped by the id we pass (server-verified).
    const db = createServiceClient().schema("booking");
    const { data, error } = await db.rpc("signage_board", {
      p_church_id: churchId,
      p_now: now.toISOString(),
    });
    if (error) {
      // Unexposed schema / missing function / no grant all surface here. This
      // is expected until the booking schema is dashboard-exposed in prod.
      return [];
    }
    return buildFacilities(data, timezone);
  } catch {
    return [];
  }
}
