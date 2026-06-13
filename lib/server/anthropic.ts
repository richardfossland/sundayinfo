import "server-only";

// LLM seam — SERVER ONLY. The Anthropic key is read from the environment
// (a Cloudflare Worker secret in production) and NEVER reaches the client
// bundle (the `server-only` guard enforces that). Mirrors the null-without-env
// pattern in lib/supabase/service.ts: getAnthropicKey() returns null when the
// key is unset, and callers degrade gracefully to the offline heuristic rather
// than crashing.

import {
  buildComposeRequest,
  parseComposeResponse,
  type AnthropicResponse,
  type ComposedSlide,
  type ComposeZone,
} from "@/lib/compose/composeSchema";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** The server-only API key, or null when unconfigured. */
export function getAnthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

/** Is the AI compose path available at all? Cheap, no network. */
export function isComposeAvailable(): boolean {
  return getAnthropicKey() !== null;
}

/** Call the Messages API and return a validated ComposedSlide, or null if the
 * key is missing, the network/model fails, or the output doesn't validate. The
 * caller falls back to parseRawText on null — this never throws. */
export async function composeWithAi(
  raw: string,
  zones: ComposeZone[],
  allowedZoneIds: string[],
  now: Date = new Date(),
): Promise<ComposedSlide | null> {
  const key = getAnthropicKey();
  if (!key) return null;

  const body = buildComposeRequest(raw, zones, now);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null; // network error / timeout → graceful fallback
  }

  if (!res.ok) {
    console.error("[compose] anthropic", res.status);
    return null;
  }

  let json: AnthropicResponse;
  try {
    json = (await res.json()) as AnthropicResponse;
  } catch {
    return null;
  }

  return parseComposeResponse(json, allowedZoneIds);
}
