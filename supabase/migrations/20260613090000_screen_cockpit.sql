-- SundayInfo migration 0002 — screen health & remote-control cockpit.
--
-- Additive + idempotent (safe to re-run; runs after 0001_info_schema).
--
-- Goal: a live ops view of paired screens with remote actions — WITHOUT a new
-- transport. The display already polls a 30 s heartbeat; we piggy-back on it:
--   • the heartbeat RESPONSE now carries any pending command ({refreshNow,
--     gotoZoneId}) which the device acts on, and the device REPORTS back what
--     it is currently showing (zone + a short label) so admins can see it;
--   • pending commands live in info.screen_command (one row per screen, PK =
--     screen_id → naturally idempotent: re-issuing just overwrites), set by the
--     screens API route. Commands are consumed-once by the next heartbeat.
--
-- Security model unchanged: RLS on, zero policies, service-role only. Devices
-- still authenticate solely by device_token_hash via the heartbeat RPC.

-- ── What each screen is currently showing (reported by the device) ───────────
-- Added to info.screen. Cheap, last-write-wins, no history.
alter table info.screen
  add column if not exists now_showing      text;       -- short human label, e.g. "Kunngjøring: Velkommen"
alter table info.screen
  add column if not exists showing_zone_id   uuid;       -- the zone the device believes it is rendering
alter table info.screen
  add column if not exists current_version    text;       -- snapshot version the device last loaded

-- ── Pending remote commands (one per screen → idempotent by construction) ────
create table if not exists info.screen_command (
  screen_id     uuid primary key references info.screen(id) on delete cascade,
  -- Idempotency / de-dupe token: the API mints a fresh id per issue; the device
  -- ack does not need to round-trip it (consume-once on heartbeat is enough),
  -- but storing it lets the cockpit show "command sent" deterministically.
  command_id    uuid not null default gen_random_uuid(),
  refresh_now   boolean not null default false,
  goto_zone_id  uuid references info.zone(id) on delete cascade,
  issued_at     timestamptz not null default now(),
  issued_by     uuid references auth.users(id) on delete set null
);

alter table info.screen_command enable row level security;

grant all on all tables in schema info to service_role;
-- (default privileges for service_role already set in 0001; re-stating grant on
--  existing tables is harmless + keeps this migration self-contained.)

-- ── Enqueue / replace a screen's pending command ─────────────────────────────
-- Idempotent: upsert on screen_id. p_goto_zone_id NULL keeps the device on its
-- assigned zone (transient preview); refresh_now forces an immediate snapshot
-- refetch on the device's next beat. The API layer has already verified that
-- the caller is a member of the screen's church (and zone access), and that the
-- target zone belongs to the same church — this RPC trusts those checks but
-- still guards cross-church zone targeting defensively.
create or replace function info.enqueue_screen_command(
  p_screen_id    uuid,
  p_refresh_now  boolean,
  p_goto_zone_id uuid,
  p_issued_by    uuid
) returns uuid
language plpgsql
security definer set search_path = info, public
as $$
declare
  v_church_id uuid;
  v_command_id uuid;
begin
  select church_id into v_church_id
    from info.screen where id = p_screen_id and status = 'paired';
  if not found then
    raise exception 'screen_not_found';
  end if;

  if p_goto_zone_id is not null and not exists (
    select 1 from info.zone where id = p_goto_zone_id and church_id = v_church_id
  ) then
    raise exception 'zone_not_found';
  end if;

  insert into info.screen_command (screen_id, refresh_now, goto_zone_id, issued_by)
    values (p_screen_id, coalesce(p_refresh_now, false), p_goto_zone_id, p_issued_by)
  on conflict (screen_id) do update
    set command_id   = gen_random_uuid(),
        refresh_now  = excluded.refresh_now,
        goto_zone_id = excluded.goto_zone_id,
        issued_at    = now(),
        issued_by    = excluded.issued_by
  returning command_id into v_command_id;

  return v_command_id;
end $$;

-- ── Screen snapshot with optional zone override (REPLACES 0001 version) ──────
-- The "push to zone" command makes the device preview a DIFFERENT zone than its
-- assigned one. To keep that secure, the device token stays the only capability:
-- an override zone must belong to the SAME church as the screen, else it falls
-- back to the assigned zone. p_zone_override defaults NULL → identical to 0001.
--
-- Drop the 0001 single-arg signature first (adding a defaulted param creates a
-- new overload; both present would make get_screen_snapshot(text) ambiguous).
drop function if exists info.get_screen_snapshot(text);
create or replace function info.get_screen_snapshot(
  p_token_hash    text,
  p_zone_override uuid default null
)
returns jsonb
language plpgsql stable
security definer set search_path = info, public
as $$
declare
  v_screen   info.screen%rowtype;
  v_zone_id  uuid;
begin
  select * into v_screen from info.screen
    where device_token_hash = p_token_hash and status = 'paired';
  if not found then
    raise exception 'screen_not_paired';
  end if;

  v_zone_id := v_screen.zone_id;
  -- Honour a same-church override (transient preview pushed via a command).
  if p_zone_override is not null and exists (
    select 1 from info.zone
     where id = p_zone_override and church_id = v_screen.church_id
  ) then
    v_zone_id := p_zone_override;
  end if;

  if v_zone_id is null then
    return jsonb_build_object('zone', null, 'screenId', v_screen.id,
                              'screenName', v_screen.name);
  end if;
  return info.get_zone_snapshot(v_zone_id)
         || jsonb_build_object('screenId', v_screen.id, 'screenName', v_screen.name);
end $$;

-- ── Heartbeat (REPLACES the 0001 version) ────────────────────────────────────
-- Now also: (a) records what the device reports it is showing, (b) consumes &
-- returns any pending command. Backwards-compatible: the two new params default
-- to NULL so an older display build still works.
--
-- Drop the 0001 two-arg signature first: adding defaulted params creates a NEW
-- overload, and leaving both would make `heartbeat(text, text)` ambiguous.
drop function if exists info.heartbeat(text, text);
create or replace function info.heartbeat(
  p_token_hash  text,
  p_user_agent  text,
  p_now_showing text default null,
  p_version     text default null
)
returns jsonb
language plpgsql
security definer set search_path = info, public
as $$
declare
  v_screen  info.screen%rowtype;
  v_cmd     info.screen_command%rowtype;
  v_command jsonb := null;
begin
  select * into v_screen from info.screen
    where device_token_hash = p_token_hash and status = 'paired';
  if not found then
    raise exception 'screen_not_paired';
  end if;

  update info.screen
     set last_seen_at    = now(),
         last_user_agent = left(coalesce(p_user_agent, ''), 300),
         now_showing     = case when p_now_showing is null then now_showing
                                else left(p_now_showing, 200) end,
         showing_zone_id = case when p_now_showing is null then showing_zone_id
                                else zone_id end,
         current_version = coalesce(p_version, current_version)
   where id = v_screen.id;

  -- Consume any pending command (delete-on-read → strictly once).
  delete from info.screen_command where screen_id = v_screen.id
    returning * into v_cmd;
  if found then
    v_command := jsonb_build_object(
      'commandId',  v_cmd.command_id,
      'refreshNow', v_cmd.refresh_now,
      'gotoZoneId', v_cmd.goto_zone_id
    );
  end if;

  return jsonb_build_object(
    'screenId', v_screen.id,
    'zoneId', v_screen.zone_id,
    'version', case when v_screen.zone_id is null then null
                    else info.snapshot_version(v_screen.zone_id) end,
    'command', v_command,
    'emergency', (
      select jsonb_build_object('id', em.id, 'body', em.body, 'expiresAt', em.expires_at)
      from info.emergency em
      where em.church_id = v_screen.church_id
        and (em.zone_id is null or em.zone_id = v_screen.zone_id)
        and em.expires_at > now()
      order by em.created_at desc
      limit 1
    )
  );
end $$;
