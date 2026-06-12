import { authFail, requireMember, requireUser } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const churchId = new URL(req.url).searchParams.get("churchId");
    if (!churchId) return fail(400, "missing_fields");
    await requireMember(user.id, churchId);

    const db = createServiceClient();
    const { data, error } = await db
      .from("screen")
      .select("id, name, zone_id, status, last_seen_at, last_user_agent, created_at")
      .eq("church_id", churchId)
      .order("created_at");
    if (error) return fail(500, "internal");
    return ok({ screens: data });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
