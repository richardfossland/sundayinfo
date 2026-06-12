import "server-only";

import { sha256Hex } from "@/lib/server/tokens";

/** Extract + hash the display device token from `Authorization: Bearer …`.
 * Returns null when absent/malformed (the RPC layer rejects unknown hashes). */
export async function bearerTokenHash(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(header);
  if (!match) return null;
  return sha256Hex(match[1]);
}
