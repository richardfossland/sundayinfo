-- 20260708120000 — Realtime Authorization for the info:zone:* / info:church:*
-- broadcast topics.
--
-- Today both channels are PUBLIC: anyone who learns a zone id or church id
-- (neither is a secret — zone ids appear in the admin UI, church ids are the
-- tenant id) can subscribe to the display's channel AND .send() a forged
-- "changed"/"emergency"/"command" event straight to every paired screen.
-- There is no data-corruption risk (the display always refetches the
-- authoritative snapshot on any event, and the 30 s heartbeat poll is the
-- source of truth regardless), but a forged event is a convincing spoof:
-- e.g. faking an "emergency" broadcast, or nudging a screen to reload at an
-- attacker-chosen moment.
--
-- Fix: the client marks both channels `private: true`
-- (lib/client/useChannel.ts), which makes Realtime authorize every
-- subscriber against RLS on realtime.messages. This policy lets anon +
-- authenticated RECEIVE (SELECT) on info:zone:*/info:church:* topics but
-- grants NO client INSERT → a forged client .send() is denied by
-- default-deny RLS. Server publish is unaffected: lib/server/broadcast.ts
-- posts to the Realtime REST broadcast endpoint using the service_role key,
-- which bypasses RLS.
--
-- realtime.messages is a Supabase-managed object absent from the vanilla
-- postgres:16 test harness, so the policy below is guarded on its presence
-- and is a clean no-op there. Additive + idempotent (safe to re-run).

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages absent (test harness) — skipping Realtime RLS policy';
    return;
  end if;

  -- RECEIVE: a private-channel subscriber reads realtime.messages for its
  -- topic. realtime.topic() returns the topic being authorized; the two
  -- patterns below cover the display's zone- and church-scoped channels.
  execute 'drop policy if exists "info_signage_receive" on realtime.messages';
  execute $p$
    create policy "info_signage_receive"
      on realtime.messages
      for select
      to anon, authenticated
      using (
        realtime.topic() like 'info:zone:%'
        or realtime.topic() like 'info:church:%'
      )
  $p$;

  -- NO insert/update/delete policy for anon/authenticated → client
  -- broadcasts (forged events) are denied by default-deny RLS. Server
  -- publish bypasses RLS via service_role.
end $$;
