import { rpcFail } from "@/lib/server/rpc";
import { clientIp, fail, ok, rateLimit } from "@/lib/server/http";
import { generatePairingCode, generateSecret, sha256Hex } from "@/lib/server/tokens";
import { createServiceClient } from "@/lib/supabase/service";

// TV calls this anonymously on boot when it has no device token: registers a
// pending screen and gets back the code to put on screen + the poll key it
// uses to wait for the claim. The poll key never leaves this device; only its
// hash is stored.
export async function POST(req: Request) {
  if (!rateLimit(`pair-start:${clientIp(req)}`, 10, 10 * 60_000)) {
    return fail(429, "rate_limited");
  }

  const db = createServiceClient();
  const pollKey = generateSecret();
  const pollKeyHash = await sha256Hex(pollKey);

  // Pairing codes are unique among pending screens; retry the rare collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generatePairingCode();
    const { error } = await db.rpc("pairing_start", {
      p_code: code,
      p_poll_key_hash: pollKeyHash,
    });
    if (!error) return ok({ code, pollKey });
    if (!/duplicate key/.test(error.message)) return rpcFail(error);
  }
  return fail(500, "code_generation_failed");
}
