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
      .select(
        "id, church_id, name, zone_id, status, last_seen_at, last_user_agent, " +
          "now_showing, showing_zone_id, current_version, created_at, " +
          "screen_command(command_id, refresh_now, goto_zone_id, issued_at)",
      )
      .eq("church_id", churchId)
      .order("created_at");
    if (error) return fail(500, "internal");

    // PostgREST returns the embedded one-row relation as an array; flatten it
    // to a single pending-command object (or null) for the cockpit.
    const screens = (data ?? []).map((row) => {
      const s = row as unknown as Record<string, unknown> & {
        screen_command?: unknown;
      };
      const cmd = Array.isArray(s.screen_command)
        ? s.screen_command[0]
        : s.screen_command;
      const { screen_command: _omit, ...rest } = s;
      void _omit;
      return { ...rest, pending_command: cmd ?? null };
    });
    return ok({ screens });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
