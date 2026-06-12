import { authFail, requireMember, requireUser, requireZoneAccess } from "@/lib/server/auth";
import { broadcast, churchTopic } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

const ALLOWED_MINUTES = [5, 15, 30, 60];

// The big red button: push an overlay to every screen (or one zone) NOW.
// Realtime gets it there in seconds; the 30 s heartbeat is the guarantee.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{
      churchId?: string;
      zoneId?: string | null;
      body?: string;
      minutes?: number;
    }>(req);
    if (!body?.churchId || !body.body?.trim()) return fail(400, "missing_fields");
    const minutes = ALLOWED_MINUTES.includes(body.minutes ?? 0) ? body.minutes! : 15;

    const membership = await requireMember(user.id, body.churchId);
    requireZoneAccess(membership, body.zoneId ?? null);

    const db = createServiceClient();
    const { data, error } = await db
      .from("emergency")
      .insert({
        church_id: body.churchId,
        zone_id: body.zoneId ?? null,
        body: body.body.trim(),
        created_by: user.id,
        expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) return fail(400, "invalid_emergency");

    await broadcast(churchTopic(body.churchId), "emergency");
    return ok({ emergencyId: data.id });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}

// Cancel: expire all active emergencies for the church immediately.
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const churchId = new URL(req.url).searchParams.get("churchId");
    if (!churchId) return fail(400, "missing_fields");
    await requireMember(user.id, churchId);

    const db = createServiceClient();
    const { error } = await db
      .from("emergency")
      .update({ expires_at: new Date().toISOString() })
      .eq("church_id", churchId)
      .gt("expires_at", new Date().toISOString());
    if (error) return fail(500, "internal");

    await broadcast(churchTopic(churchId), "emergency");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
