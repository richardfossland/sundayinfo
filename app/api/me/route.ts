import { authFail, getMemberships, requireUser } from "@/lib/server/auth";
import { ok } from "@/lib/server/http";
import { createPublicServiceClient } from "@/lib/supabase/service";

// Who am I + which churches can I edit. Drives the church switcher.
export async function GET() {
  try {
    const user = await requireUser();
    const memberships = await getMemberships(user.id);

    let withNames: Array<Record<string, unknown>> = [];
    if (memberships.length > 0) {
      const pub = createPublicServiceClient();
      const { data: churches } = await pub
        .from("church")
        .select("id, name")
        .in("id", memberships.map((m) => m.churchId));
      const names = new Map((churches ?? []).map((c) => [c.id as string, c.name as string]));
      withNames = memberships.map((m) => ({
        churchId: m.churchId,
        churchName: names.get(m.churchId) ?? "Ukjent menighet",
        role: m.role,
        allowedZoneIds: m.allowedZoneIds,
      }));
    }

    return ok({ userId: user.id, email: user.email ?? null, memberships: withNames });
  } catch (err) {
    const res = authFail(err);
    if (res) return res;
    throw err;
  }
}
