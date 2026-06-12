import { authFail, requireMember, requireUser } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_PAYLOAD_BYTES = 300_000; // QR data-URLs are ~10-40 KB; images are URLs

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const churchId = new URL(req.url).searchParams.get("churchId");
    if (!churchId) return fail(400, "missing_fields");
    await requireMember(user.id, churchId);

    const db = createServiceClient();
    const [items, links] = await Promise.all([
      db
        .from("content_item")
        .select("id, type, title, body, payload, publish_at, expires_at, created_at")
        .eq("church_id", churchId)
        .order("created_at", { ascending: false }),
      db.from("zone_item").select("zone_id, item_id"),
    ]);
    if (items.error || links.error) return fail(500, "internal");

    const zonesByItem = new Map<string, string[]>();
    for (const l of links.data ?? []) {
      const arr = zonesByItem.get(l.item_id as string) ?? [];
      arr.push(l.zone_id as string);
      zonesByItem.set(l.item_id as string, arr);
    }
    return ok({
      items: (items.data ?? []).map((it) => ({
        ...it,
        zoneIds: zonesByItem.get(it.id as string) ?? [],
      })),
    });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{
      churchId?: string;
      type?: string;
      title?: string;
      bodyText?: string;
      payload?: Record<string, unknown>;
      publishAt?: string | null;
      expiresAt?: string | null;
      zoneIds?: string[];
    }>(req);
    if (!body?.churchId || !body.type) return fail(400, "missing_fields");
    const membership = await requireMember(user.id, body.churchId);

    if (JSON.stringify(body.payload ?? {}).length > MAX_PAYLOAD_BYTES) {
      return fail(413, "payload_too_large");
    }

    const db = createServiceClient();
    const { data, error } = await db
      .from("content_item")
      .insert({
        church_id: body.churchId,
        type: body.type,
        title: body.title ?? "",
        body: body.bodyText ?? "",
        payload: body.payload ?? {},
        publish_at: body.publishAt ?? null,
        expires_at: body.expiresAt ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[content]", error.message);
      return fail(400, "invalid_content");
    }

    // Initial playlist placement (only zones the editor may touch).
    const zoneIds = (body.zoneIds ?? []).filter(
      (z) =>
        membership.role === "admin" ||
        membership.allowedZoneIds === null ||
        membership.allowedZoneIds.includes(z),
    );
    if (zoneIds.length > 0) {
      const { data: zones } = await db
        .from("zone")
        .select("id")
        .eq("church_id", body.churchId)
        .in("id", zoneIds);
      for (const z of zones ?? []) {
        await db.from("zone_item").insert({
          zone_id: z.id,
          item_id: data.id,
          sort_order: 999, // appended; reorder happens on the zone page
        });
      }
    }

    return ok({ itemId: data.id });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
