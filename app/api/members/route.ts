import { authFail, requireAdmin, requireUser } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";
import {
  createPublicServiceClient,
  createServiceClient,
} from "@/lib/supabase/service";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function adminAuthClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const churchId = new URL(req.url).searchParams.get("churchId");
    if (!churchId) return fail(400, "missing_fields");
    await requireAdmin(user.id, churchId);

    const db = createServiceClient();
    const { data, error } = await db
      .from("member")
      .select("user_id, role, allowed_zone_ids")
      .eq("church_id", churchId);
    if (error) return fail(500, "internal");

    // Resolve emails via the auth admin API (service role only).
    const auth = adminAuthClient();
    const members = await Promise.all(
      (data ?? []).map(async (m) => {
        const { data: u } = await auth.auth.admin.getUserById(m.user_id as string);
        return {
          userId: m.user_id,
          email: u?.user?.email ?? null,
          role: m.role,
          allowedZoneIds: m.allowed_zone_ids,
        };
      }),
    );
    return ok({ members });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}

// Invite an editor by email. If the address has no Sunday account yet,
// Supabase sends an invite email that doubles as their first login link.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{
      churchId?: string;
      email?: string;
      role?: "admin" | "editor";
      allowedZoneIds?: string[] | null;
    }>(req);
    const email = body?.email?.trim().toLowerCase();
    if (!body?.churchId || !email) return fail(400, "missing_fields");
    await requireAdmin(user.id, body.churchId);

    const auth = adminAuthClient();
    // Find or invite the auth user.
    let userId: string | null = null;
    const { data: invited, error: inviteErr } =
      await auth.auth.admin.inviteUserByEmail(email);
    if (!inviteErr) {
      userId = invited.user.id;
    } else if (/already.*registered|already.*exists/i.test(inviteErr.message)) {
      const { data: list } = await auth.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      userId = list?.users.find(
        (u) => u.email?.toLowerCase() === email,
      )?.id ?? null;
    }
    if (!userId) return fail(404, "user_not_found");

    const db = createServiceClient();
    const { error } = await db.from("member").upsert({
      church_id: body.churchId,
      user_id: userId,
      role: body.role === "admin" ? "admin" : "editor",
      allowed_zone_ids: body.allowedZoneIds ?? null,
    });
    if (error) return fail(500, "internal");

    // Mirror into suite membership so SSO grants line up later.
    const pub = createPublicServiceClient();
    await pub
      .from("church_member")
      .upsert({ church_id: body.churchId, user_id: userId, role: "viewer" })
      .select();

    return ok({ userId });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
