import { bearerTokenHash } from "@/lib/server/device";
import { fail, ok } from "@/lib/server/http";
import { rpcFail } from "@/lib/server/rpc";
import { createServiceClient } from "@/lib/supabase/service";

// Full display payload for the screen's zone. The device token is a
// capability for exactly this — nothing else in the API accepts it.
// Optional ?zoneId= lets the device honour a "push to zone" command and preview
// another zone; the RPC enforces it belongs to the same church (else falls back
// to the assigned zone), so the token never widens beyond the screen's church.
export async function GET(req: Request) {
  const tokenHash = await bearerTokenHash(req);
  if (!tokenHash) return fail(401, "missing_token");

  const zoneId = new URL(req.url).searchParams.get("zoneId");

  const db = createServiceClient();
  const { data, error } = await db.rpc("get_screen_snapshot", {
    p_token_hash: tokenHash,
    p_zone_override: zoneId || null,
  });
  if (error) return rpcFail(error);
  return ok(data);
}
