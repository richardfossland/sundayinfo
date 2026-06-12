import { authFail, requireMember, requireUser, requireZoneAccess } from "@/lib/server/auth";
import { broadcast, zoneTopic } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

// Replace the zone's playlist (order + per-slide durations) atomically enough
// for our scale: delete + insert. Editors restricted to zones may only touch
// their own zones.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const db = createServiceClient();
    const { data: zone } = await db
      .from("zone")
      .select("church_id")
      .eq("id", id)
      .single();
    if (!zone) return fail(404, "zone_not_found");

    const membership = await requireMember(user.id, zone.church_id as string);
    requireZoneAccess(membership, id);

    const body = await readJson<{
      items?: { itemId: string; durationSeconds?: number | null }[];
    }>(req);
    if (!body?.items) return fail(400, "missing_fields");

    // Every item must belong to the same church — no cross-tenant playlists.
    const itemIds = body.items.map((i) => i.itemId);
    if (itemIds.length > 0) {
      const { count } = await db
        .from("content_item")
        .select("id", { count: "exact", head: true })
        .eq("church_id", zone.church_id as string)
        .in("id", itemIds);
      if ((count ?? 0) !== itemIds.length) return fail(400, "foreign_items");
    }

    await db.from("zone_item").delete().eq("zone_id", id);
    if (body.items.length > 0) {
      const { error } = await db.from("zone_item").insert(
        body.items.map((item, index) => ({
          zone_id: id,
          item_id: item.itemId,
          sort_order: index,
          duration_seconds: item.durationSeconds ?? null,
        })),
      );
      if (error) return fail(500, "internal");
    }
    await broadcast(zoneTopic(id), "changed");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
