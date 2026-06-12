import "server-only";

// Server-side Supabase Realtime broadcast via the REST endpoint — lets a
// stateless Route Handler push an event to a channel without opening a
// websocket. Failures are swallowed (logged): realtime is a hint layer; the
// display's 30 s heartbeat poll recovers anything a lost broadcast missed.

export async function broadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    });
    if (!res.ok) {
      console.warn("[broadcast] failed", topic, event, res.status);
    }
  } catch (err) {
    console.warn("[broadcast] error", topic, event, err);
  }
}

/** Channel topics. The display subscribes to BOTH its zone topic and the
 * church topic (church-wide hints like emergencies + settings changes). */
export const zoneTopic = (zoneId: string) => `info:zone:${zoneId}`;
export const churchTopic = (churchId: string) => `info:church:${churchId}`;
