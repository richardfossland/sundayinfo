import { authFail, requireMember, requireUser } from "@/lib/server/auth";
import { broadcast, churchTopic } from "@/lib/server/broadcast";
import { fail, ok, readJson } from "@/lib/server/http";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const churchId = new URL(req.url).searchParams.get("churchId");
    if (!churchId) return fail(400, "missing_fields");
    await requireMember(user.id, churchId);

    const db = createServiceClient();
    const { data, error } = await db
      .from("event")
      .select(
        "id, title, kind, weekday, date, start_time, duration_minutes, program, pre_window_min, post_window_min, active",
      )
      .eq("church_id", churchId)
      .order("weekday", { nullsFirst: false })
      .order("start_time");
    if (error) return fail(500, "internal");
    return ok({ events: data });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{
      churchId?: string;
      title?: string;
      kind?: string;
      weekday?: number | null;
      date?: string | null;
      startTime?: string;
      durationMinutes?: number;
      program?: { time: string; title: string; subtitle?: string }[];
      preWindowMin?: number;
      postWindowMin?: number;
    }>(req);
    if (!body?.churchId || !body.title?.trim() || !body.startTime) {
      return fail(400, "missing_fields");
    }
    await requireMember(user.id, body.churchId);

    const db = createServiceClient();
    const { data, error } = await db
      .from("event")
      .insert({
        church_id: body.churchId,
        title: body.title.trim(),
        kind: body.kind ?? "service",
        weekday: body.weekday ?? null,
        date: body.date ?? null,
        start_time: body.startTime,
        duration_minutes: body.durationMinutes ?? 90,
        program: body.program ?? [],
        pre_window_min: body.preWindowMin ?? 60,
        post_window_min: body.postWindowMin ?? 45,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[events]", error.message);
      return fail(400, "invalid_event");
    }
    await broadcast(churchTopic(body.churchId), "changed");
    return ok({ eventId: data.id });
  } catch (err) {
    return authFail(err) ?? Promise.reject(err);
  }
}
