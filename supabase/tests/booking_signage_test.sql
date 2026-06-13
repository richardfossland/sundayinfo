-- Validates the SundayBooking → SundayInfo signage CONTRACT: that
-- booking.signage_board returns the now/next-per-room shape SundayInfo's
-- fetchFacilities/buildFacilities consume. Runs after _booking_prelude.sql.
-- (The pure formatting of these rows is covered by test/facilities.test.ts.)

set search_path = booking, public;

-- Reuse the church created by the info logic test (10000…0001 = Testkirken).
do $$
declare
  c   constant uuid := '10000000-0000-0000-0000-000000000001';
  now constant timestamptz := '2026-05-18T13:00:00Z';
  r_stor uuid; r_lille uuid;
  et_wed uuid; et_choir uuid;
  v_board jsonb;
  v_stor  jsonb;
  v_lille jsonb;
begin
  insert into booking.resource (church_id, kind, name)
    values (c, 'room', 'Storsalen') returning id into r_stor;
  insert into booking.resource (church_id, kind, name)
    values (c, 'room', 'Lillesalen') returning id into r_lille;
  insert into booking.event_type (church_id, name)
    values (c, 'bryllup') returning id into et_wed;
  insert into booking.event_type (church_id, name)
    values (c, 'korøvelse') returning id into et_choir;

  -- Storsalen: running wedding 14–18 (local) + next choir 19–20.
  insert into booking.booking (church_id, event_type_id, title, starts_at_utc, ends_at_utc, status, show_on_signage)
    values (c, et_wed, 'Bryllup', '2026-05-18T12:00:00Z', '2026-05-18T16:00:00Z', 'approved', true)
    returning id into et_wed; -- reuse var as booking id holder
  insert into booking.booking_resource (booking_id, resource_id) values (et_wed, r_stor);

  insert into booking.booking (church_id, title, starts_at_utc, ends_at_utc, status, show_on_signage)
    values (c, 'Korøvelse', '2026-05-18T17:00:00Z', '2026-05-18T18:00:00Z', 'approved', true)
    returning id into et_choir;
  insert into booking.booking_resource (booking_id, resource_id) values (et_choir, r_stor);

  -- Lillesalen: a private (not-signage) booking that must NOT leak.
  insert into booking.booking (church_id, title, starts_at_utc, ends_at_utc, status, show_on_signage)
    values (c, 'Privat samtale', '2026-05-18T12:00:00Z', '2026-05-18T16:00:00Z', 'approved', false)
    returning id into et_choir;
  insert into booking.booking_resource (booking_id, resource_id) values (et_choir, r_lille);

  -- An approved+signage upcoming booking in Lillesalen (so the room appears).
  insert into booking.booking (church_id, title, starts_at_utc, ends_at_utc, status, show_on_signage)
    values (c, 'Babysang', '2026-05-18T15:00:00Z', '2026-05-18T16:00:00Z', 'approved', true)
    returning id into et_choir;
  insert into booking.booking_resource (booking_id, resource_id) values (et_choir, r_lille);

  v_board := booking.signage_board(c, now);

  -- Two rooms, ordered by resource_name (Lillesalen, Storsalen).
  assert jsonb_array_length(v_board) = 2,
    format('expected 2 rooms, got %s', v_board);
  v_lille := v_board->0;
  v_stor  := v_board->1;
  assert v_lille->>'resource_name' = 'Lillesalen', 'rooms ordered by name';
  assert v_stor->>'resource_name' = 'Storsalen';

  -- Storsalen: current = Bryllup, next = Korøvelse.
  assert v_stor->'current'->>'title' = 'Bryllup', 'Storsalen current is the wedding';
  assert v_stor->'current'->>'event_type' = 'bryllup';
  assert v_stor->'next'->>'title' = 'Korøvelse', 'Storsalen next is the choir';

  -- Lillesalen: nothing running now (the private one is excluded), next = Babysang.
  assert v_lille->'current' = 'null'::jsonb, 'private booking must not show as current';
  assert v_lille->'next'->>'title' = 'Babysang', 'Lillesalen next is the signage booking';

  raise notice 'PASS: signage_board returns now/next per room, excludes non-signage bookings';
end $$;

-- Empty/unknown church → empty board (the degrade-to-nothing path).
do $$
declare
  v_board jsonb;
begin
  v_board := booking.signage_board('99999999-9999-9999-9999-999999999999', '2026-05-18T13:00:00Z');
  assert v_board = '[]'::jsonb, format('unknown church yields empty board, got %s', v_board);
  raise notice 'PASS: unknown church → empty signage board';
end $$;

select 'ALL BOOKING-SIGNAGE TESTS PASSED' as result;
