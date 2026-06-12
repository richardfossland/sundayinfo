import { authFail, requireAdmin, requireMember, requireUser } from "@/lib/server/auth";
import { broadcast, churchTopic } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const churchId = new URL(req.url).searchParams.get("churchId");
    if (!churchId) return fail(400, "missing_fields");
    await requireMember(user.id, churchId);

    const db = createServiceClient();
    const { data } = await db
      .from("church_settings")
      .select("vipps_number, default_theme, settings")
      .eq("church_id", churchId)
      .maybeSingle();
    return ok({
      vippsNumber: data?.vipps_number ?? null,
      defaultTheme: data?.default_theme ?? "dark",
      settings: data?.settings ?? {},
    });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{
      churchId?: string;
      vippsNumber?: string | null;
      defaultTheme?: string;
      settings?: Record<string, unknown>;
    }>(req);
    if (!body?.churchId) return fail(400, "missing_fields");
    await requireAdmin(user.id, body.churchId);

    const db = createServiceClient();
    const { error } = await db.from("church_settings").upsert({
      church_id: body.churchId,
      vipps_number: body.vippsNumber ?? null,
      default_theme: body.defaultTheme ?? "dark",
      settings: body.settings ?? {},
    });
    if (error) return fail(500, "internal");
    await broadcast(churchTopic(body.churchId), "changed");
    return ok({});
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
