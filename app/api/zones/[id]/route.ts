import { authFail, requireAdmin, requireUser } from "@/lib/server/auth";
import { zoneTopic, broadcast } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

async function zoneChurch(zoneId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("zone").select("church_id").eq("id", zoneId).single();
  return (data?.church_id as string | undefined) ?? null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const churchId = await zoneChurch(id);
    if (!churchId) return fail(404, "zone_not_found");
    await requireAdmin(user.id, churchId);

    const body = await readJson<{
      name?: string;
      theme?: string;
      settings?: Record<string, unknown>;
      sortOrder?: number;
    }>(req);
    if (!body) return fail(400, "missing_fields");

    const patch: Record<string, unknown> = {};
    if (body.name?.trim()) patch.name = body.name.trim();
    if (body.theme) patch.theme = body.theme;
    if (body.settings) patch.settings = body.settings;
    if (typeof body.sortOrder === "number") patch.sort_order = body.sortOrder;

    const db = createServiceClient();
    const { error } = await db.from("zone").update(patch).eq("id", id);
    if (error) return fail(500, "internal");
    await broadcast(zoneTopic(id), "changed");
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
    const churchId = await zoneChurch(id);
    if (!churchId) return fail(404, "zone_not_found");
    await requireAdmin(user.id, churchId);

    const db = createServiceClient();
    const { error } = await db.from("zone").delete().eq("id", id);
    if (error) return fail(500, "internal");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
