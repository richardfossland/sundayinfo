import { authFail, requireMember, requireUser, requireZoneAccess } from "@/lib/server/auth";
import { rpcFail } from "@/lib/server/rpc";
import { fail, ok, readJson } from "@/lib/server/http";
import { generateSecret, sha256Hex } from "@/lib/server/tokens";
import { createServiceClient } from "@/lib/supabase/service";

// Editor (signed in, on their phone) claims the code shown on the TV and
// attaches the screen to a church + zone. Membership is verified against the
// session — the churchId in the body is only a *selection*, not a credential.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{
      code?: string;
      churchId?: string;
      zoneId?: string | null;
      name?: string;
    }>(req);
    if (!body?.code || !body.churchId) return fail(400, "missing_fields");

    const membership = await requireMember(user.id, body.churchId);
    const zoneId = body.zoneId ?? null;
    requireZoneAccess(membership, zoneId);

    const deviceToken = generateSecret();
    const db = createServiceClient();
    const { data, error } = await db.rpc("pairing_claim", {
      p_code: body.code,
      p_church_id: body.churchId,
      p_zone_id: zoneId,
      p_name: body.name ?? "",
      p_device_token_hash: await sha256Hex(deviceToken),
      p_staged_token: deviceToken,
    });
    if (error) return rpcFail(error);
    return ok({ screenId: data });
  } catch (err) {
    const res = authFail(err);
    if (res) return res;
    throw err;
  }
}
