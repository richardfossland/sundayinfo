import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type Membership = {
  churchId: string;
  role: "admin" | "editor";
  /** null = all zones */
  allowedZoneIds: string[] | null;
};

export class AuthError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

/** Resolve the signed-in user from the session cookie. Authorization is NEVER
 * taken from the request body — membership is looked up server-side below. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError(401, "not_signed_in");
  return user;
}

export async function getMemberships(userId: string): Promise<Membership[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("member")
    .select("church_id, role, allowed_zone_ids")
    .eq("user_id", userId);
  if (error) throw new AuthError(500, "membership_lookup_failed");
  return (data ?? []).map((m) => ({
    churchId: m.church_id as string,
    role: m.role as "admin" | "editor",
    allowedZoneIds: (m.allowed_zone_ids as string[] | null) ?? null,
  }));
}

export async function requireMember(
  userId: string,
  churchId: string,
): Promise<Membership> {
  const memberships = await getMemberships(userId);
  const m = memberships.find((x) => x.churchId === churchId);
  if (!m) throw new AuthError(403, "not_a_member");
  return m;
}

export async function requireAdmin(
  userId: string,
  churchId: string,
): Promise<Membership> {
  const m = await requireMember(userId, churchId);
  if (m.role !== "admin") throw new AuthError(403, "admin_required");
  return m;
}

/** Editors may be restricted to specific zones; admins always pass. */
export function canTouchZone(m: Membership, zoneId: string | null): boolean {
  if (m.role === "admin") return true;
  if (m.allowedZoneIds === null) return true;
  if (zoneId === null) return false; // church-wide actions need full access
  return m.allowedZoneIds.includes(zoneId);
}

export function requireZoneAccess(m: Membership, zoneId: string | null): void {
  if (!canTouchZone(m, zoneId)) throw new AuthError(403, "zone_forbidden");
}

/** Uniform catch → Response for API routes. */
export function authFail(err: unknown): Response | null {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
