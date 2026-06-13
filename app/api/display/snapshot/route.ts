import { fetchFacilities } from "@/lib/server/booking";
import { bearerTokenHash } from "@/lib/server/device";
import { fail, ok } from "@/lib/server/http";
import { rpcFail } from "@/lib/server/rpc";
import { createServiceClient } from "@/lib/supabase/service";
import type { FacilitiesRoom } from "@/lib/types";

// Full display payload for the screen's zone. The device token is a
// capability for exactly this — nothing else in the API accepts it.
export async function GET(req: Request) {
  const tokenHash = await bearerTokenHash(req);
  if (!tokenHash) return fail(401, "missing_token");

  const db = createServiceClient();
  const { data, error } = await db.rpc("get_screen_snapshot", {
    p_token_hash: tokenHash,
  });
  if (error) return rpcFail(error);

  // Optional enrichment: live "fasiliteter i bruk" room board from the sibling
  // SundayBooking app. Opt-in per zone or church via a `showFacilities` flag in
  // the respective `settings` jsonb. The booking schema is a separate, optional
  // deploy, so fetchFacilities degrades to [] when it's absent/unexposed — we
  // always attach a (possibly empty) array so the display never null-checks it.
  let facilities: FacilitiesRoom[] = [];
  const snap = data as {
    church?: { id?: string; timezone?: string; settings?: Record<string, unknown> } | null;
    zone?: { settings?: Record<string, unknown> } | null;
  } | null;
  const churchId = snap?.church?.id;
  if (churchId && facilitiesEnabled(snap?.zone?.settings, snap?.church?.settings)) {
    facilities = await fetchFacilities(churchId, snap?.church?.timezone ?? "Europe/Oslo");
  }

  return ok({ ...(data as object), facilities });
}

/** Zone setting wins when present; otherwise fall back to the church default.
 * Truthy `showFacilities` (boolean true) opts in. */
function facilitiesEnabled(
  zoneSettings: Record<string, unknown> | undefined,
  churchSettings: Record<string, unknown> | undefined,
): boolean {
  const zone = zoneSettings?.showFacilities;
  if (typeof zone === "boolean") return zone;
  return churchSettings?.showFacilities === true;
}
