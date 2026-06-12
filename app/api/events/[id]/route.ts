import { authFail, requireMember, requireUser } from "@/lib/server/auth";
import { broadcast, churchTopic } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

async function eventChurch(eventId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("event").select("church_id").eq("id", eventId).single();
  return (data?.church_id as string | undefined) ?? null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const churchId = await eventChurch(id);
    if (!churchId) return fail(404, "event_not_found");
    await requireMember(user.id, churchId);

    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return fail(400, "missing_fields");

    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (body.kind !== undefined) patch.kind = body.kind;
    if (body.weekday !== undefined) patch.weekday = body.weekday;
    if (body.date !== undefined) patch.date = body.date;
    if (body.startTime !== undefined) patch.start_time = body.startTime;
    if (body.durationMinutes !== undefined) patch.duration_minutes = body.durationMinutes;
    if (body.program !== undefined) patch.program = body.program;
    if (body.preWindowMin !== undefined) patch.pre_window_min = body.preWindowMin;
    if (body.postWindowMin !== undefined) patch.post_window_min = body.postWindowMin;
    if (body.active !== undefined) patch.active = body.active;

    const db = createServiceClient();
    const { error } = await db.from("event").update(patch).eq("id", id);
    if (error) return fail(400, "invalid_event");
    await broadcast(churchTopic(churchId), "changed");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const churchId = await eventChurch(id);
    if (!churchId) return fail(404, "event_not_found");
    await requireMember(user.id, churchId);

    const db = createServiceClient();
    const { error } = await db.from("event").delete().eq("id", id);
    if (error) return fail(500, "internal");
    await broadcast(churchTopic(churchId), "changed");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
