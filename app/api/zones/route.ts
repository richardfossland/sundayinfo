import { authFail, requireAdmin, requireMember, requireUser } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const churchId = new URL(req.url).searchParams.get("churchId");
    if (!churchId) return fail(400, "missing_fields");
    await requireMember(user.id, churchId);

    const db = createServiceClient();
    const { data, error } = await db
      .from("zone")
      .select("id, name, theme, settings, sort_order")
      .eq("church_id", churchId)
      .order("sort_order")
      .order("created_at");
    if (error) return fail(500, "internal");
    return ok({ zones: data });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ churchId?: string; name?: string; theme?: string }>(req);
    if (!body?.churchId || !body.name?.trim()) return fail(400, "missing_fields");
    await requireAdmin(user.id, body.churchId);

    const db = createServiceClient();
    const { data, error } = await db
      .from("zone")
      .insert({
        church_id: body.churchId,
        name: body.name.trim(),
        theme: body.theme ?? "dark",
      })
      .select("id")
      .single();
    if (error) return fail(500, "internal");
    return ok({ zoneId: data.id });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
