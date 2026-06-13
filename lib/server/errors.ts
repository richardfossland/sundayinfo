import "server-only";

// RPC error codes (raised in supabase/migrations/0001_info_schema.sql) → HTTP
// statuses. Anything unrecognised is a 500.

const STATUS_BY_CODE: Record<string, number> = {
  zone_not_found: 404,
  code_not_found: 404,
  pairing_not_found: 404,
  pairing_expired: 410,
  pairing_consumed: 410,
  screen_not_paired: 401,
  screen_not_found: 404,
};

export function rpcErrorStatus(message: string): { status: number; code: string } {
  const code = message.trim();
  const status = STATUS_BY_CODE[code];
  return status ? { status, code } : { status: 500, code: "internal" };
}
