import { bearerTokenHash } from "@/lib/server/device";
import { fail, ok, readJson } from "@/lib/server/http";
import { rpcFail } from "@/lib/server/rpc";
import { createServiceClient } from "@/lib/supabase/service";

// The display's 30 s pulse: records liveness, reports what the screen is
// currently showing, and returns {version, command, emergency} so the screen
// knows whether to refetch the snapshot, act on a remote command, and show
// emergencies — all within one poll interval, even where realtime doesn't work.
export async function POST(req: Request) {
  const tokenHash = await bearerTokenHash(req);
  if (!tokenHash) return fail(401, "missing_token");

  // Body is optional (older display builds send none); fields are advisory.
  const body =
    (await readJson<{ nowShowing?: string; version?: string }>(req)) ?? {};
  const nowShowing =
    typeof body.nowShowing === "string" ? body.nowShowing.slice(0, 200) : null;
  const version = typeof body.version === "string" ? body.version : null;

  const db = createServiceClient();
  const { data, error } = await db.rpc("heartbeat", {
    p_token_hash: tokenHash,
    p_user_agent: req.headers.get("user-agent") ?? "",
    p_now_showing: nowShowing,
    p_version: version,
  });
  if (error) return rpcFail(error);
  return ok(data);
}
