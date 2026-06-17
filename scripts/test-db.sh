#!/usr/bin/env bash
# Validate the SundayInfo migration + signage logic against a throwaway
# Postgres. Requires Docker. Spins up postgres:16, recreates the
# Supabase/SundayPlan objects the migration expects, applies the migration
# twice (idempotency), runs the logic assertions, then tears down.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=info-pgtest
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

run() { docker cp "$1" "$NAME:/tmp/$(basename "$1")" >/dev/null; docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f "/tmp/$(basename "$1")"; }

echo "→ prelude (Supabase/Plan shims)"; run supabase/tests/_prelude.sql
echo "→ migrations (1st apply)"
for m in supabase/migrations/*.sql; do echo "  · $(basename "$m")"; run "$m"; done
echo "→ migrations (2nd apply — idempotency)"
for m in supabase/migrations/*.sql; do echo "  · $(basename "$m")"; run "$m"; done
echo "→ logic assertions"
docker cp supabase/tests/info_logic_test.sql "$NAME:/tmp/info_logic_test.sql" >/dev/null
OUT=$(docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/info_logic_test.sql 2>&1)
echo "$OUT" | grep -E "PASS|FAIL" || true
echo "$OUT" | grep -q "ALL INFO-LOGIC TESTS PASSED" || { echo "TESTS FAILED"; echo "$OUT" | tail -30; exit 1; }

# Optional SundayBooking sibling: recreate the minimal `booking` slice + the
# VERBATIM signage view/RPC and assert SundayInfo's consumption contract. The
# booking schema is a SEPARATE deploy; SundayInfo degrades to nothing when it's
# absent in prod, but here we prove the feed shape the facilities board reads.
echo "→ booking signage prelude (optional sibling)"; run supabase/tests/_booking_prelude.sql
echo "→ booking signage assertions"
docker cp supabase/tests/booking_signage_test.sql "$NAME:/tmp/booking_signage_test.sql" >/dev/null
OUT=$(docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/booking_signage_test.sql 2>&1)
echo "$OUT" | grep -E "PASS|FAIL" || true
echo "$OUT" | grep -q "ALL BOOKING-SIGNAGE TESTS PASSED" || { echo "TESTS FAILED"; echo "$OUT" | tail -30; exit 1; }
echo "✓ all database checks passed"
