import { authFail, requireUser } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";
import {
  createPublicServiceClient,
  createServiceClient,
} from "@/lib/supabase/service";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[æå]/g, "a")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "menighet";
}

// Create a church (suite-wide tenant row — shared with SundayPlan) and make
// the creator its SundayInfo admin, with a default zone ready for pairing.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ name?: string }>(req);
    const name = body?.name?.trim();
    if (!name || name.length < 2 || name.length > 80) return fail(400, "missing_fields");

    const pub = createPublicServiceClient();
    const base = slugify(name);

    // Slug must be unique suite-wide; suffix on collision.
    let church: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !church; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await pub
        .from("church")
        .insert({ name, slug })
        .select("id")
        .single();
      if (!error) church = data as { id: string };
      else if (!/duplicate key/.test(error.message)) {
        console.error("[churches]", error.message);
        return fail(500, "church_create_failed");
      }
    }
    if (!church) return fail(409, "slug_taken");

    // Suite membership (so SundayPlan sees the same tenant) + signage admin.
    await pub
      .from("church_member")
      .upsert({ church_id: church.id, user_id: user.id, role: "admin" });

    const db = createServiceClient();
    const { error: memberErr } = await db
      .from("member")
      .insert({ church_id: church.id, user_id: user.id, role: "admin" });
    if (memberErr) {
      console.error("[churches] member", memberErr.message);
      return fail(500, "church_create_failed");
    }
    await db.from("zone").insert({ church_id: church.id, name: "Foajé" });
    await db.from("church_settings").insert({ church_id: church.id });

    return ok({ churchId: church.id });
  } catch (err) {
    const res = authFail(err);
    if (res) return res;
    throw err;
  }
}
