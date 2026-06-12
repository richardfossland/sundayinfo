import "server-only";

import { rpcErrorStatus } from "@/lib/server/errors";
import { fail } from "@/lib/server/http";

/** Map a Supabase RPC error (whose message is one of our stable snake_case
 * codes) to an HTTP response. */
export function rpcFail(error: { message: string }): Response {
  const { status, code } = rpcErrorStatus(error.message);
  if (status === 500) console.error("[rpc]", error.message);
  return fail(status, code);
}
