import { authFail, requireMember, requireUser, requireZoneAccess } from "@/lib/server/auth";
import { broadcast, zoneTopic } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

// Rename, move to another zone, or revoke a screen. Revoking flips status —
// the device's next heartbeat gets 401 and it falls back to pairing mode.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const db = createServiceClient();
    const { data: screen } = await db
      .from("screen")
      .select("church_id, zone_id")
      .eq("id", id)
      .single();
    if (!screen?.church_id) return fail(404, "screen_not_found");
    const membership = await requireMember(user.id, screen.church_id as string);

    const body = await readJson<{
      name?: string;
      zoneId?: string | null;
      revoke?: boolean;
    }>(req);
    if (!body) return fail(400, "missing_fields");

    const patch: Record<string, unknown> = {};
    if (body.name?.trim()) patch.name = body.name.trim();
    if (body.zoneId !== undefined) {
      requireZoneAccess(membership, body.zoneId);
      if (body.zoneId !== null) {
        const { data: zone } = await db
          .from("zone")
          .select("id")
          .eq("id", body.zoneId)
          .eq("church_id", screen.church_id as string)
          .single();
        if (!zone) return fail(404, "zone_not_found");
      }
      patch.zone_id = body.zoneId;
    }
    if (body.revoke) {
      patch.status = "revoked";
      patch.device_token_hash = null;
    }

    const { error } = await db.from("screen").update(patch).eq("id", id);
    if (error) return fail(500, "internal");

    const affectedZone = (body.zoneId ?? screen.zone_id) as string | null;
    if (affectedZone) await broadcast(zoneTopic(affectedZone), "changed");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
