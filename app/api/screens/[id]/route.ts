import { authFail, requireMember, requireUser, requireZoneAccess } from "@/lib/server/auth";
import { broadcast, churchTopic, zoneTopic } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { rpcFail } from "@/lib/server/rpc";
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

// Remote control: queue a pending command the device picks up on its next
// heartbeat (no new transport). { refreshNow?, gotoZoneId? }:
//   • refreshNow  → device refetches its snapshot immediately
//   • gotoZoneId  → device previews another zone (transient; null = stay put)
// Idempotent: re-issuing replaces the single pending command for the screen.
// A church-topic broadcast nudges the device to beat now instead of waiting
// up to 30 s; the heartbeat poll is the guarantee if the broadcast is lost.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const db = createServiceClient();
    const { data: screen } = await db
      .from("screen")
      .select("church_id")
      .eq("id", id)
      .single();
    if (!screen?.church_id) return fail(404, "screen_not_found");
    const membership = await requireMember(user.id, screen.church_id as string);

    const body = await readJson<{ refreshNow?: boolean; gotoZoneId?: string | null }>(req);
    if (!body) return fail(400, "missing_fields");

    const gotoZoneId = body.gotoZoneId ?? null;
    // Pushing a screen to a zone requires access to that target zone.
    if (gotoZoneId !== null) requireZoneAccess(membership, gotoZoneId);

    const { data, error } = await db.rpc("enqueue_screen_command", {
      p_screen_id: id,
      p_refresh_now: body.refreshNow ?? false,
      p_goto_zone_id: gotoZoneId,
      p_issued_by: user.id,
    });
    if (error) return rpcFail(error);

    // Best-effort nudge so the device beats now rather than at the next tick.
    await broadcast(churchTopic(screen.church_id as string), "command");
    return ok({ commandId: data });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
