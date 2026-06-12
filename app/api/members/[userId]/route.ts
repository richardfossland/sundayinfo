import { authFail, requireAdmin, requireUser } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const user = await requireUser();
    const { userId } = await params;
    const body = await readJson<{
      churchId?: string;
      role?: "admin" | "editor";
      allowedZoneIds?: string[] | null;
    }>(req);
    if (!body?.churchId) return fail(400, "missing_fields");
    await requireAdmin(user.id, body.churchId);

    const patch: Record<string, unknown> = {};
    if (body.role) patch.role = body.role;
    if (body.allowedZoneIds !== undefined) patch.allowed_zone_ids = body.allowedZoneIds;

    const db = createServiceClient();
    const { error } = await db
      .from("member")
      .update(patch)
      .eq("church_id", body.churchId)
      .eq("user_id", userId);
    if (error) return fail(500, "internal");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const user = await requireUser();
    const { userId } = await params;
    const churchId = new URL(req.url).searchParams.get("churchId");
    if (!churchId) return fail(400, "missing_fields");
    await requireAdmin(user.id, churchId);
    if (userId === user.id) return fail(400, "cannot_remove_self");

    const db = createServiceClient();
    const { error } = await db
      .from("member")
      .delete()
      .eq("church_id", churchId)
      .eq("user_id", userId);
    if (error) return fail(500, "internal");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
