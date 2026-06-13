import { authFail, requireMember, requireUser } from "@/lib/server/auth";
import { clientIp, fail, ok, rateLimit, readJson } from "@/lib/server/http";
import { composeWithAi, isComposeAvailable } from "@/lib/server/anthropic";
import { createServiceClient } from "@/lib/supabase/service";
import { parseRawText } from "@/lib/compose/parseRawText";
import type { ComposedSlide, ComposeZone } from "@/lib/compose/composeSchema";
import type { ZoneTheme } from "@/lib/types";

const MAX_RAW_CHARS = 8_000;

/** A heuristic ParsedContent shaped as a ComposedSlide (ai=false). The offline
 * fallback — used when no key is configured or the model call fails. */
function heuristicSlide(raw: string): ComposedSlide {
  const p = parseRawText(raw);
  return {
    type: p.reference ? "verse" : p.url ? "qr" : "announcement",
    title: p.title,
    body: p.body,
    url: p.url,
    reference: p.reference,
    expiresAt: null,
    zoneIds: [],
    durationSeconds: null,
    accent: null,
    ai: false,
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ churchId?: string; raw?: string }>(req);
    const raw = (body?.raw ?? "").slice(0, MAX_RAW_CHARS);
    if (!body?.churchId || !raw.trim()) return fail(400, "missing_fields");

    // Authorization is looked up server-side — never from the body.
    const membership = await requireMember(user.id, body.churchId);

    // Best-effort per-user rate limit (suite convention; the model call is the
    // expensive bit). 20 composes / 5 min.
    if (!rateLimit(`compose:${user.id}:${clientIp(req)}`, 20, 5 * 60_000)) {
      return fail(429, "rate_limited");
    }

    // No key configured → offline heuristic, clearly flagged not-AI.
    if (!isComposeAvailable()) {
      return ok({ slide: heuristicSlide(raw), aiAvailable: false });
    }

    // The zones the editor may actually route to — admins see all, editors only
    // their allowed set. This is the gate the model's routing is filtered to.
    const db = createServiceClient();
    const { data: zoneRows } = await db
      .from("zone")
      .select("id, name, theme")
      .eq("church_id", body.churchId)
      .order("sort_order")
      .order("created_at");

    const zones: ComposeZone[] = (zoneRows ?? [])
      .filter(
        (z) =>
          membership.role === "admin" ||
          membership.allowedZoneIds === null ||
          membership.allowedZoneIds.includes(z.id as string),
      )
      .map((z) => ({
        id: z.id as string,
        name: z.name as string,
        theme: (z.theme as ZoneTheme) ?? "dark",
      }));
    const allowedZoneIds = zones.map((z) => z.id);

    const slide = await composeWithAi(raw, zones, allowedZoneIds);

    // Model failed / output didn't validate → fall back, but AI was available.
    if (!slide) {
      return ok({ slide: heuristicSlide(raw), aiAvailable: true, fellBack: true });
    }
    return ok({ slide, aiAvailable: true });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
