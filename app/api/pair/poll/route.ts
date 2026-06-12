import { rpcFail } from "@/lib/server/rpc";
import { clientIp, fail, ok, rateLimit, readJson } from "@/lib/server/http";
import { sha256Hex } from "@/lib/server/tokens";
import { createServiceClient } from "@/lib/supabase/service";

// TV polls (every ~3 s) until an editor claims the code. The device token is
// delivered exactly once; afterwards the poll key is spent.
export async function POST(req: Request) {
  if (!rateLimit(`pair-poll:${clientIp(req)}`, 60, 60_000)) {
    return fail(429, "rate_limited");
  }
  const body = await readJson<{ pollKey?: string }>(req);
  if (!body?.pollKey || typeof body.pollKey !== "string") {
    return fail(400, "missing_poll_key");
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("pairing_poll", {
    p_poll_key_hash: await sha256Hex(body.pollKey),
  });
  if (error) return rpcFail(error);
  return ok(data);
}
