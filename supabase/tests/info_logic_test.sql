-- SundayInfo logic assertions. Run by scripts/test-db.sh after the migration.
-- Style: one DO block per scenario; `assert` + RAISE NOTICE 'PASS: …'.

set search_path = info, public;

-- Fixtures ────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@test.no'),
  ('00000000-0000-0000-0000-000000000002', 'editor@test.no');
insert into public.church (id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', 'Testkirken', 'testkirken'),
  ('10000000-0000-0000-0000-000000000002', 'Annenkirken', 'annenkirken');
insert into info.zone (id, church_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Foajé'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Kafé'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Annen foajé');

-- 1. Pairing happy path ───────────────────────────────────────────────────────
do $$
declare
  v_screen uuid;
  v_poll jsonb;
begin
  v_screen := info.pairing_start('ABC234', 'pollhash-1');
  assert v_screen is not null;

  v_poll := info.pairing_poll('pollhash-1');
  assert v_poll->>'status' = 'pending', 'poll before claim should be pending';

  perform info.pairing_claim('abc234', '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 'Foajé-TV', 'tokenhash-1', 'plain-token-1');

  v_poll := info.pairing_poll('pollhash-1');
  assert v_poll->>'status' = 'paired', 'poll after claim should be paired';
  assert v_poll->>'deviceToken' = 'plain-token-1', 'token delivered on first poll';

  -- code is case-insensitive on claim (stored upper)
  raise notice 'PASS: pairing happy path (start → poll → claim → token pickup)';
end $$;

-- 2. Token delivered exactly once; staged plaintext cleared ───────────────────
do $$
declare
  v_err text;
begin
  begin
    perform info.pairing_poll('pollhash-1');
    raise exception 'should_have_failed';
  exception when others then
    v_err := sqlerrm;
  end;
  assert v_err = 'pairing_not_found',
    format('second poll must fail (poll key cleared), got %s', v_err);
  assert (select staged_device_token from info.screen where device_token_hash = 'tokenhash-1') is null,
    'staged plaintext must be cleared after pickup';
  raise notice 'PASS: device token one-time delivery';
end $$;

-- 3. Claim with unknown/expired code fails ────────────────────────────────────
do $$
declare
  v_err text;
  v_screen uuid;
begin
  begin
    perform info.pairing_claim('ZZZZZZ', '10000000-0000-0000-0000-000000000001',
      null, 'X', 'h', 't');
    raise exception 'should_have_failed';
  exception when others then v_err := sqlerrm; end;
  assert v_err = 'code_not_found', 'unknown code rejected';

  v_screen := info.pairing_start('EXP111', 'pollhash-exp');
  update info.screen set pairing_code_expires_at = now() - interval '1 minute'
    where id = v_screen;
  begin
    perform info.pairing_claim('EXP111', '10000000-0000-0000-0000-000000000001',
      null, 'X', 'h2', 't2');
    raise exception 'should_have_failed';
  exception when others then v_err := sqlerrm; end;
  assert v_err = 'code_not_found', 'expired code rejected';

  begin
    perform info.pairing_poll('pollhash-exp');
    raise exception 'should_have_failed';
  exception when others then v_err := sqlerrm; end;
  assert v_err = 'pairing_expired', 'poll on expired pairing reports expiry';
  raise notice 'PASS: unknown + expired pairing codes rejected';
end $$;

-- 4. Claim into a zone of ANOTHER church fails ────────────────────────────────
do $$
declare
  v_err text;
begin
  perform info.pairing_start('XYZ789', 'pollhash-2');
  begin
    perform info.pairing_claim('XYZ789', '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000003', 'Feil sone', 'h3', 't3');
    raise exception 'should_have_failed';
  exception when others then v_err := sqlerrm; end;
  assert v_err = 'zone_not_found', 'cross-church zone rejected';
  raise notice 'PASS: cannot claim a screen into another church''s zone';
end $$;

-- 5. Snapshot: publish/expiry filtering ───────────────────────────────────────
do $$
declare
  v_snap jsonb;
  c constant uuid := '10000000-0000-0000-0000-000000000001';
  z constant uuid := '20000000-0000-0000-0000-000000000001';
  v_live uuid; v_future uuid; v_expired uuid;
begin
  insert into info.content_item (church_id, type, title) values
    (c, 'announcement', 'Synlig nå') returning id into v_live;
  insert into info.content_item (church_id, type, title, publish_at) values
    (c, 'announcement', 'Kommer senere', now() + interval '1 day') returning id into v_future;
  insert into info.content_item (church_id, type, title, expires_at) values
    (c, 'announcement', 'Utløpt', now() - interval '1 minute') returning id into v_expired;
  insert into info.zone_item (zone_id, item_id, sort_order) values
    (z, v_live, 0), (z, v_future, 1), (z, v_expired, 2);

  v_snap := info.get_zone_snapshot(z);
  assert jsonb_array_length(v_snap->'items') = 1,
    format('only the live item in snapshot, got %s', v_snap->'items');
  assert v_snap->'items'->0->>'title' = 'Synlig nå';
  raise notice 'PASS: snapshot filters unpublished + expired items';
end $$;

-- 6. Snapshot: zone scoping ───────────────────────────────────────────────────
do $$
declare
  v_snap jsonb;
begin
  v_snap := info.get_zone_snapshot('20000000-0000-0000-0000-000000000002');
  assert jsonb_array_length(v_snap->'items') = 0, 'other zone has empty playlist';
  raise notice 'PASS: playlists are zone-scoped';
end $$;

-- 7. Version changes on playlist edits, item edits and deletes ────────────────
do $$
declare
  z constant uuid := '20000000-0000-0000-0000-000000000001';
  v1 text; v2 text; v3 text; v4 text;
  v_item uuid;
begin
  v1 := info.snapshot_version(z);

  select item_id into v_item from info.zone_item where zone_id = z limit 1;
  update info.content_item set title = 'Endret tittel' where id = v_item;
  v2 := info.snapshot_version(z);
  assert v1 <> v2, 'item edit bumps version';

  delete from info.zone_item where zone_id = z and item_id = v_item;
  v3 := info.snapshot_version(z);
  assert v2 <> v3, 'playlist removal bumps version';

  insert into info.zone_item (zone_id, item_id) values (z, v_item);
  v4 := info.snapshot_version(z);
  assert v3 <> v4, 'playlist add bumps version';
  raise notice 'PASS: snapshot_version tracks edits, removals and adds';
end $$;

-- 8. Emergency: targeting + heartbeat + version bump ──────────────────────────
do $$
declare
  c constant uuid := '10000000-0000-0000-0000-000000000001';
  z1 constant uuid := '20000000-0000-0000-0000-000000000001';
  z2 constant uuid := '20000000-0000-0000-0000-000000000002';
  v_before text; v_after text;
  v_hb jsonb;
  v_snap jsonb;
begin
  v_before := info.snapshot_version(z1);

  -- zone-targeted emergency hits only z2
  insert into info.emergency (church_id, zone_id, body, expires_at)
    values (c, z2, 'Kun kafé', now() + interval '10 minutes');
  v_snap := info.get_zone_snapshot(z1);
  assert v_snap->'emergency' = 'null'::jsonb, 'z1 unaffected by z2 emergency';
  v_snap := info.get_zone_snapshot(z2);
  assert v_snap->'emergency'->>'body' = 'Kun kafé', 'z2 sees its emergency';

  -- church-wide emergency hits all zones + bumps version
  insert into info.emergency (church_id, body, expires_at)
    values (c, 'Bil sperrer utgangen', now() + interval '10 minutes');
  v_after := info.snapshot_version(z1);
  assert v_before <> v_after, 'emergency bumps version';

  v_hb := info.heartbeat('tokenhash-1', 'TestBrowser/1.0');
  assert v_hb->'emergency'->>'body' = 'Bil sperrer utgangen', 'heartbeat carries emergency';
  assert v_hb->>'version' = v_after, 'heartbeat version matches snapshot_version';
  assert (select last_seen_at from info.screen where device_token_hash = 'tokenhash-1') is not null,
    'heartbeat records last_seen';

  -- expired emergencies disappear
  update info.emergency set expires_at = now() - interval '1 second';
  v_snap := info.get_zone_snapshot(z1);
  assert v_snap->'emergency' = 'null'::jsonb, 'expired emergency gone';
  raise notice 'PASS: emergency targeting, heartbeat payload, auto-expiry';
end $$;

-- 9. Revoked screens are locked out ───────────────────────────────────────────
do $$
declare
  v_err text;
begin
  update info.screen set status = 'revoked' where device_token_hash = 'tokenhash-1';
  begin
    perform info.heartbeat('tokenhash-1', 'x');
    raise exception 'should_have_failed';
  exception when others then v_err := sqlerrm; end;
  assert v_err = 'screen_not_paired', 'revoked heartbeat rejected';
  begin
    perform info.get_screen_snapshot('tokenhash-1');
    raise exception 'should_have_failed';
  exception when others then v_err := sqlerrm; end;
  assert v_err = 'screen_not_paired', 'revoked snapshot rejected';
  raise notice 'PASS: revoked screens locked out of heartbeat + snapshot';
end $$;

-- 10. get_screen_snapshot joins screen → zone snapshot ────────────────────────
do $$
declare
  v_snap jsonb;
begin
  update info.screen set status = 'paired' where device_token_hash = 'tokenhash-1';
  v_snap := info.get_screen_snapshot('tokenhash-1');
  assert v_snap->'zone'->>'name' = 'Foajé', 'screen snapshot resolves its zone';
  assert v_snap->>'screenName' = 'Foajé-TV';
  assert v_snap ? 'version', 'screen snapshot carries version';
  raise notice 'PASS: screen snapshot resolves zone + carries identity';
end $$;

-- 11. Heartbeat records "currently showing" + version (cockpit telemetry) ─────
do $$
declare
  v_hb jsonb;
  v_row info.screen%rowtype;
begin
  -- screen tokenhash-1 is paired again (test 10). Report showing + version.
  v_hb := info.heartbeat('tokenhash-1', 'Mozilla/5.0 (X11; CrOS) Chrome/120',
                         'Foajé · Kunngjøring: Velkommen', 'ver-abc');
  select * into v_row from info.screen where device_token_hash = 'tokenhash-1';
  assert v_row.now_showing = 'Foajé · Kunngjøring: Velkommen', 'now_showing recorded';
  assert v_row.showing_zone_id = v_row.zone_id, 'showing_zone_id mirrors zone on report';
  assert v_row.current_version = 'ver-abc', 'current_version recorded';
  assert v_row.last_user_agent like 'Mozilla/5.0%', 'user agent recorded';

  -- NULL showing must NOT wipe the previous report (older display builds).
  v_hb := info.heartbeat('tokenhash-1', 'x', null, null);
  select * into v_row from info.screen where device_token_hash = 'tokenhash-1';
  assert v_row.now_showing = 'Foajé · Kunngjøring: Velkommen',
    'null showing keeps previous label';
  assert v_row.current_version = 'ver-abc', 'null version keeps previous';
  raise notice 'PASS: heartbeat records currently-showing telemetry';
end $$;

-- 12. Enqueue command + consume-once on heartbeat ─────────────────────────────
do $$
declare
  c constant uuid := '10000000-0000-0000-0000-000000000001';
  z2 constant uuid := '20000000-0000-0000-0000-000000000002';
  v_screen uuid;
  v_cmd_id uuid;
  v_hb jsonb;
begin
  select id into v_screen from info.screen where device_token_hash = 'tokenhash-1';

  -- refresh-only command
  v_cmd_id := info.enqueue_screen_command(v_screen, true, null,
    '00000000-0000-0000-0000-000000000001');
  assert v_cmd_id is not null, 'command id returned';
  assert exists (select 1 from info.screen_command where screen_id = v_screen),
    'command queued';

  v_hb := info.heartbeat('tokenhash-1', 'x', null, null);
  assert (v_hb->'command'->>'refreshNow')::boolean = true, 'heartbeat carries refresh command';
  assert v_hb->'command'->>'commandId' = v_cmd_id::text, 'command id matches';
  assert not exists (select 1 from info.screen_command where screen_id = v_screen),
    'command consumed (delete-on-read)';

  -- next heartbeat has no pending command
  v_hb := info.heartbeat('tokenhash-1', 'x', null, null);
  assert v_hb->'command' = 'null'::jsonb, 'no command after consume';
  raise notice 'PASS: command enqueue + consume-once on heartbeat';
end $$;

-- 13. Enqueue is idempotent (one pending command per screen) ──────────────────
do $$
declare
  z2 constant uuid := '20000000-0000-0000-0000-000000000002';
  v_screen uuid;
  v_id1 uuid; v_id2 uuid;
begin
  select id into v_screen from info.screen where device_token_hash = 'tokenhash-1';
  v_id1 := info.enqueue_screen_command(v_screen, true, null,
    '00000000-0000-0000-0000-000000000001');
  v_id2 := info.enqueue_screen_command(v_screen, false, z2,
    '00000000-0000-0000-0000-000000000001');
  assert (select count(*) from info.screen_command where screen_id = v_screen) = 1,
    'still exactly one pending command after re-issue';
  assert v_id1 <> v_id2, 're-issue mints a fresh command id';
  assert (select goto_zone_id from info.screen_command where screen_id = v_screen) = z2,
    'latest command wins';
  assert (select refresh_now from info.screen_command where screen_id = v_screen) = false,
    'latest fields replace earlier ones';
  -- clean up so it does not leak into later asserts
  perform info.heartbeat('tokenhash-1', 'x', null, null);
  raise notice 'PASS: enqueue_screen_command is idempotent per screen';
end $$;

-- 14. goto-zone command targets only same-church zones ────────────────────────
do $$
declare
  v_screen uuid;
  v_err text;
begin
  select id into v_screen from info.screen where device_token_hash = 'tokenhash-1';
  begin
    -- zone of ANOTHER church
    perform info.enqueue_screen_command(v_screen, false,
      '20000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000001');
    raise exception 'should_have_failed';
  exception when others then v_err := sqlerrm; end;
  assert v_err = 'zone_not_found', 'cross-church goto zone rejected';
  assert not exists (select 1 from info.screen_command where screen_id = v_screen),
    'rejected command leaves nothing queued';
  raise notice 'PASS: goto-zone command rejects cross-church zones';
end $$;

-- 15. Snapshot zone override honours same-church only ─────────────────────────
do $$
declare
  v_snap jsonb;
begin
  -- override to the café zone (same church) → preview that zone
  v_snap := info.get_screen_snapshot('tokenhash-1', '20000000-0000-0000-0000-000000000002');
  assert v_snap->'zone'->>'name' = 'Kafé', 'override previews same-church zone';

  -- override to another church's zone → ignored, falls back to assigned (Foajé)
  v_snap := info.get_screen_snapshot('tokenhash-1', '20000000-0000-0000-0000-000000000003');
  assert v_snap->'zone'->>'name' = 'Foajé', 'cross-church override ignored';

  -- no override → assigned zone
  v_snap := info.get_screen_snapshot('tokenhash-1');
  assert v_snap->'zone'->>'name' = 'Foajé', 'no override = assigned zone';
  raise notice 'PASS: screen snapshot zone override is church-scoped';
end $$;

-- 16. Enqueue against a non-paired screen fails ───────────────────────────────
do $$
declare
  v_err text;
begin
  begin
    perform info.enqueue_screen_command(gen_random_uuid(), true, null, null);
    raise exception 'should_have_failed';
  exception when others then v_err := sqlerrm; end;
  assert v_err = 'screen_not_found', 'enqueue on unknown screen rejected';
  raise notice 'PASS: enqueue rejects unknown/unpaired screens';
end $$;

select 'ALL INFO-LOGIC TESTS PASSED' as result;
