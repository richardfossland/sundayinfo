-- Validates the SundayPlan → SundayInfo service-signage CONTRACT: that
-- public.service_signage_board returns the {name, starts, items[]} shape
-- SundayInfo's fetchServiceProgram/buildServiceProgram consume. Runs after
-- _service_prelude.sql. (Pure formatting is covered by test/serviceplan.test.ts.)

set search_path = public;

-- Published service in the now/next window wins over a draft; items ordered.
do $$
declare
  c     constant uuid := '10000000-0000-0000-0000-000000000001'; -- Testkirken
  now   constant timestamptz := '2026-05-18T08:30:00Z';          -- 30 min pre-service
  s_pub   uuid;
  v_board jsonb;
  v_items jsonb;
begin
  insert into public.service (church_id, name, starts_at_utc, state)
    values (c, 'Høymesse', '2026-05-18T09:00:00Z', 'published') returning id into s_pub;
  insert into public.service_item (service_id, position, label, kind, duration_min) values
    (s_pub, 2, 'Lovsang',  'song',     8),
    (s_pub, 1, 'Velkomst', 'welcome',  3),
    (s_pub, 3, 'Preken',   'sermon',  20);

  -- A DRAFT service the same morning must NOT be picked (not published).
  insert into public.service (church_id, name, starts_at_utc, state)
    values (c, 'Utkast', '2026-05-18T08:45:00Z', 'draft');

  v_board := public.service_signage_board(c, now);

  assert v_board is not null, 'a published service in window must be returned';
  assert v_board->>'name' = 'Høymesse',
    format('expected Høymesse, got %s', v_board->>'name');
  assert v_board->>'service_id' = s_pub::text, 'draft must not win over published';

  v_items := v_board->'items';
  assert jsonb_array_length(v_items) = 3, format('expected 3 items, got %s', v_items);
  assert v_items->0->>'label' = 'Velkomst', 'items ordered by position';
  assert v_items->2->>'label' = 'Preken';
  assert v_items->0->>'kind'  = 'welcome';

  raise notice 'PASS: service_signage_board returns the published service + ordered items';
end $$;

-- Out-of-window + unknown church → null board (the degrade-to-nothing path).
do $$
declare
  c   constant uuid := '10000000-0000-0000-0000-000000000001';
  v_late    jsonb;
  v_unknown jsonb;
begin
  -- Same church, queried long AFTER the only service (09:00Z) — past the 3h
  -- "still showing" window and with nothing else upcoming → null.
  v_late := public.service_signage_board(c, '2026-05-18T20:00:00Z');
  assert v_late is null, format('after-window service yields null, got %s', v_late);

  -- Unknown church → null.
  v_unknown := public.service_signage_board(
    '99999999-9999-9999-9999-999999999999', '2026-05-18T08:30:00Z');
  assert v_unknown is null, format('unknown church yields null, got %s', v_unknown);

  raise notice 'PASS: out-of-window + unknown church → null board';
end $$;

select 'ALL SERVICE-SIGNAGE TESTS PASSED' as result;
