import {
  authFail,
  requireItemZoneAccess,
  requireMember,
  requireUser,
} from "@/lib/server/auth";
import { broadcast, zoneTopic } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

async function itemContext(itemId: string) {
  const db = createServiceClient();
  const { data: item } = await db
    .from("content_item")
    .select("church_id")
    .eq("id", itemId)
    .single();
  if (!item) return null;
  const { data: links } = await db
    .from("zone_item")
    .select("zone_id")
    .eq("item_id", itemId);
  return {
    churchId: item.church_id as string,
    zoneIds: (links ?? []).map((l) => l.zone_id as string),
  };
}

async function notifyZones(zoneIds: string[]) {
  await Promise.all(zoneIds.map((z) => broadcast(zoneTopic(z), "changed")));
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const ctx = await itemContext(id);
    if (!ctx) return fail(404, "item_not_found");
    const membership = await requireMember(user.id, ctx.churchId);
    // Zone-restricted editors may only edit items within their own zones.
    requireItemZoneAccess(membership, ctx.zoneIds);

    const body = await readJson<{
      title?: string;
      bodyText?: string;
      payload?: Record<string, unknown>;
      publishAt?: string | null;
      expiresAt?: string | null;
    }>(req);
    if (!body) return fail(400, "missing_fields");

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.bodyText !== undefined) patch.body = body.bodyText;
    if (body.payload !== undefined) patch.payload = body.payload;
    if (body.publishAt !== undefined) patch.publish_at = body.publishAt;
    if (body.expiresAt !== undefined) patch.expires_at = body.expiresAt;

    const db = createServiceClient();
    const { error } = await db.from("content_item").update(patch).eq("id", id);
    if (error) return fail(400, "invalid_content");
    await notifyZones(ctx.zoneIds);
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
    const ctx = await itemContext(id);
    if (!ctx) return fail(404, "item_not_found");
    const membership = await requireMember(user.id, ctx.churchId);
    // Zone-restricted editors may only delete items within their own zones.
    requireItemZoneAccess(membership, ctx.zoneIds);

    const db = createServiceClient();
    const { error } = await db.from("content_item").delete().eq("id", id);
    if (error) return fail(500, "internal");
    await notifyZones(ctx.zoneIds);
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
