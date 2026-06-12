import { bearerTokenHash } from "@/lib/server/device";
import { fail, ok } from "@/lib/server/http";
import { rpcFail } from "@/lib/server/rpc";
import { createServiceClient } from "@/lib/supabase/service";

// The display's 30 s pulse: records liveness and returns {version, emergency}
// so the screen knows whether to refetch the snapshot — and shows emergencies
// within one poll interval even where realtime doesn't work.
export async function POST(req: Request) {
  const tokenHash = await bearerTokenHash(req);
  if (!tokenHash) return fail(401, "missing_token");

  const db = createServiceClient();
  const { data, error } = await db.rpc("heartbeat", {
    p_token_hash: tokenHash,
    p_user_agent: req.headers.get("user-agent") ?? "",
  });
  if (error) return rpcFail(error);
  return ok(data);
}
