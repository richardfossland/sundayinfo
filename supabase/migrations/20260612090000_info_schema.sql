-- SundayInfo migration 0001 — `info` schema (digital signage for churches).
--
-- Lives in the SundayPlan Supabase project: tenancy (public.church,
-- public.church_member, auth.users) is reused, NOT duplicated here.
-- Idempotent: safe to re-run.
--
-- Security model (suite convention): RLS enabled on every table with ZERO
-- policies — no anon/authenticated access to tables at all. Every read/write
-- goes through Next API routes using the service role. Display devices are not
-- Supabase users; they authenticate with a hashed device token via RPCs below.
--
-- After applying, the `info` schema must be EXPOSED in the Supabase dashboard
-- (Settings → API → Exposed schemas) — exposure cannot be set via SQL.

create extension if not exists pgcrypto;

create schema if not exists info;

-- Explicit grants: a non-public schema gets nothing by default (learned the
-- hard way on `harvest`/`market`). Only service_role may touch it.
grant usage on schema info to service_role;

-- ── Members (signage roles; suite membership lives in public.church_member) ──
create table if not exists info.member (
  church_id        uuid not null references public.church(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null check (role in ('admin','editor')),
  -- NULL = all zones; otherwise the editor may only touch these zones.
  allowed_zone_ids uuid[],
  created_at       timestamptz not null default now(),
  primary key (church_id, user_id)
);
create index if not exists member_user_idx on info.member (user_id);

-- ── Zones (one playlist + theme per physical placement: foyer, café, kids) ──
create table if not exists info.zone (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.church(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  theme       text not null default 'dark' check (theme in ('dark','light','liturgical')),
  -- {slideDurationSeconds, showClock, ...} — display hints, not logic.
  settings    jsonb not null default '{}'::jsonb,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists zone_church_idx on info.zone (church_id);

-- ── Screens (paired devices) ────────────────────────────────────────────────
create table if not exists info.screen (
  id                      uuid primary key default gen_random_uuid(),
  church_id               uuid references public.church(id) on delete cascade,
  zone_id                 uuid references info.zone(id) on delete set null,
  name                    text not null default '',
  status                  text not null default 'pending'
                            check (status in ('pending','paired','revoked')),
  pairing_code            text,
  pairing_code_expires_at timestamptz,
  pairing_poll_key_hash   text,
  -- Only the sha256 hash of the device token is stored; the plaintext is
  -- staged for exactly one poll pickup, then cleared.
  device_token_hash       text,
  staged_device_token     text,
  last_seen_at            timestamptz,
  last_user_agent         text,
  created_at              timestamptz not null default now()
);
-- A pairing code only needs to be unique among screens still waiting.
create unique index if not exists screen_pairing_code_uq
  on info.screen (pairing_code) where status = 'pending';
create unique index if not exists screen_poll_key_uq
  on info.screen (pairing_poll_key_hash) where pairing_poll_key_hash is not null;
create unique index if not exists screen_device_token_uq
  on info.screen (device_token_hash) where device_token_hash is not null;
create index if not exists screen_church_idx on info.screen (church_id);

-- ── Content items ───────────────────────────────────────────────────────────
create table if not exists info.content_item (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.church(id) on delete cascade,
  type        text not null check (type in ('announcement','verse','qr','image')),
  title       text not null default '' check (char_length(title) <= 200),
  body        text not null default '' check (char_length(body) <= 4000),
  -- Per-type extras: {qrDataUrl, qrLabel, url, reference, templateId, accent…}
  payload     jsonb not null default '{}'::jsonb,
  publish_at  timestamptz,            -- NULL = visible immediately
  expires_at  timestamptz,            -- NULL = never expires
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists content_church_idx on info.content_item (church_id);

-- ── Playlist membership ─────────────────────────────────────────────────────
create table if not exists info.zone_item (
  zone_id          uuid not null references info.zone(id) on delete cascade,
  item_id          uuid not null references info.content_item(id) on delete cascade,
  sort_order       int not null default 0,
  duration_seconds int check (duration_seconds between 3 and 600),
  created_at       timestamptz not null default now(),
  primary key (zone_id, item_id)
);

-- ── Events (services + other gatherings; drives auto-mode + program slides) ─
create table if not exists info.event (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null references public.church(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 120),
  kind             text not null default 'service' check (kind in ('service','other')),
  -- Recurring weekly (weekday 0=Sunday…6=Saturday) XOR one-off (date).
  weekday          int check (weekday between 0 and 6),
  date             date,
  start_time       time not null,
  duration_minutes int not null default 90 check (duration_minutes between 5 and 720),
  -- [{time:"11:00", title:"Lovsang", subtitle:"..."}]
  program          jsonb not null default '[]'::jsonb,
  pre_window_min   int not null default 60 check (pre_window_min between 0 and 720),
  post_window_min  int not null default 45 check (post_window_min between 0 and 720),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint event_recurring_xor_oneoff
    check ((weekday is not null and date is null) or (weekday is null and date is not null))
);
create index if not exists event_church_idx on info.event (church_id);

-- ── Emergency messages (realtime overlay, auto-expiring) ────────────────────
create table if not exists info.emergency (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.church(id) on delete cascade,
  zone_id     uuid references info.zone(id) on delete cascade, -- NULL = all zones
  body        text not null check (char_length(body) between 1 and 500),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists emergency_church_idx on info.emergency (church_id);

-- ── Per-church signage settings ─────────────────────────────────────────────
create table if not exists info.church_settings (
  church_id     uuid primary key references public.church(id) on delete cascade,
  vipps_number  text,
  default_theme text not null default 'dark'
                  check (default_theme in ('dark','light','liturgical')),
  settings      jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

-- ── RLS: enabled, zero policies (service role only) ─────────────────────────
alter table info.member          enable row level security;
alter table info.zone            enable row level security;
alter table info.screen          enable row level security;
alter table info.content_item    enable row level security;
alter table info.zone_item       enable row level security;
alter table info.event           enable row level security;
alter table info.emergency       enable row level security;
alter table info.church_settings enable row level security;

grant all on all tables in schema info to service_role;
alter default privileges in schema info grant all on tables to service_role;

-- ── updated_at maintenance ──────────────────────────────────────────────────
create or replace function info.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists zone_touch on info.zone;
create trigger zone_touch before update on info.zone
  for each row execute function info.touch_updated_at();
drop trigger if exists content_touch on info.content_item;
create trigger content_touch before update on info.content_item
  for each row execute function info.touch_updated_at();
drop trigger if exists event_touch on info.event;
create trigger event_touch before update on info.event
  for each row execute function info.touch_updated_at();
drop trigger if exists settings_touch on info.church_settings;
create trigger settings_touch before update on info.church_settings
  for each row execute function info.touch_updated_at();

-- Playlist edits must bump the zone so snapshot_version changes (zone_item has
-- no updated_at of its own; deletes are covered because the version hash also
-- aggregates row ids).
create or replace function info.touch_zone()
returns trigger language plpgsql as $$
begin
  update info.zone set updated_at = now()
    where id = coalesce(new.zone_id, old.zone_id);
  return coalesce(new, old);
end $$;

drop trigger if exists zone_item_touch on info.zone_item;
create trigger zone_item_touch after insert or update or delete on info.zone_item
  for each row execute function info.touch_zone();

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs — SECURITY DEFINER, called via the service client. Errors are raised
-- with stable snake_case codes the API layer maps to HTTP statuses.
-- ════════════════════════════════════════════════════════════════════════════

-- Cheap change-detection hash for a zone: covers playlist membership, item
-- edits/deletes, zone config, church events, settings and emergencies.
create or replace function info.snapshot_version(p_zone_id uuid)
returns text
language sql stable
security definer set search_path = info, public
as $$
  select md5(
    coalesce((select z.updated_at::text from info.zone z where z.id = p_zone_id), '') ||
    coalesce((
      select string_agg(zi.item_id::text || ci.updated_at::text, ',' order by zi.item_id)
      from info.zone_item zi join info.content_item ci on ci.id = zi.item_id
      where zi.zone_id = p_zone_id
    ), '') ||
    coalesce((
      select string_agg(e.id::text || e.updated_at::text, ',' order by e.id)
      from info.event e
      where e.church_id = (select church_id from info.zone where id = p_zone_id)
        and e.active
    ), '') ||
    coalesce((
      select cs.updated_at::text
      from info.church_settings cs
      where cs.church_id = (select church_id from info.zone where id = p_zone_id)
    ), '') ||
    coalesce((
      select string_agg(em.id::text, ',' order by em.id)
      from info.emergency em
      where em.church_id = (select church_id from info.zone where id = p_zone_id)
        and (em.zone_id is null or em.zone_id = p_zone_id)
        and em.expires_at > now()
    ), '')
  );
$$;

-- Full display payload for one zone. The server filters out expired/unpublished
-- items, but publish_at/expires_at ship with each row so an OFFLINE display can
-- keep filtering on its own clock — content never goes stale on screen.
create or replace function info.get_zone_snapshot(p_zone_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = info, public
as $$
declare
  v_zone   info.zone%rowtype;
  v_result jsonb;
begin
  select * into v_zone from info.zone where id = p_zone_id;
  if not found then
    raise exception 'zone_not_found';
  end if;

  select jsonb_build_object(
    'version', info.snapshot_version(p_zone_id),
    'generatedAt', now(),
    'zone', jsonb_build_object(
      'id', v_zone.id, 'name', v_zone.name,
      'theme', v_zone.theme, 'settings', v_zone.settings
    ),
    'church', (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'timezone', c.timezone,
        'vippsNumber', cs.vipps_number,
        'settings', coalesce(cs.settings, '{}'::jsonb)
      )
      from public.church c
      left join info.church_settings cs on cs.church_id = c.id
      where c.id = v_zone.church_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ci.id, 'type', ci.type, 'title', ci.title, 'body', ci.body,
        'payload', ci.payload,
        'publishAt', ci.publish_at, 'expiresAt', ci.expires_at,
        'durationSeconds', zi.duration_seconds, 'sortOrder', zi.sort_order
      ) order by zi.sort_order, ci.created_at)
      from info.zone_item zi
      join info.content_item ci on ci.id = zi.item_id
      where zi.zone_id = p_zone_id
        and (ci.publish_at is null or ci.publish_at <= now())
        and (ci.expires_at is null or ci.expires_at > now())
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'kind', e.kind,
        'weekday', e.weekday, 'date', e.date,
        'startTime', e.start_time, 'durationMinutes', e.duration_minutes,
        'program', e.program,
        'preWindowMin', e.pre_window_min, 'postWindowMin', e.post_window_min
      ) order by e.weekday nulls last, e.date nulls last, e.start_time)
      from info.event e
      where e.church_id = v_zone.church_id and e.active
        and (e.date is null or e.date >= current_date)
    ), '[]'::jsonb),
    'emergency', (
      select jsonb_build_object(
        'id', em.id, 'body', em.body, 'expiresAt', em.expires_at
      )
      from info.emergency em
      where em.church_id = v_zone.church_id
        and (em.zone_id is null or em.zone_id = p_zone_id)
        and em.expires_at > now()
      order by em.created_at desc
      limit 1
    )
  ) into v_result;

  return v_result;
end $$;

-- ── Pairing state machine ───────────────────────────────────────────────────

-- TV calls (anon via API): register a pending screen showing `p_code`.
create or replace function info.pairing_start(
  p_code text, p_poll_key_hash text
) returns uuid
language plpgsql
security definer set search_path = info, public
as $$
declare
  v_id uuid;
begin
  -- Drop stale pending rows for hygiene (codes live 15 minutes).
  delete from info.screen
    where status = 'pending' and pairing_code_expires_at < now() - interval '1 hour';

  insert into info.screen (status, pairing_code, pairing_code_expires_at, pairing_poll_key_hash)
  values ('pending', upper(p_code), now() + interval '15 minutes', p_poll_key_hash)
  returning id into v_id;
  return v_id;
end $$;

-- Admin calls (auth via API; membership already verified by the API layer):
-- claim the code for a church/zone and stage the device token for pickup.
create or replace function info.pairing_claim(
  p_code text, p_church_id uuid, p_zone_id uuid, p_name text,
  p_device_token_hash text, p_staged_token text
) returns uuid
language plpgsql
security definer set search_path = info, public
as $$
declare
  v_id uuid;
begin
  if p_zone_id is not null and not exists (
    select 1 from info.zone where id = p_zone_id and church_id = p_church_id
  ) then
    raise exception 'zone_not_found';
  end if;

  update info.screen
     set status = 'paired',
         church_id = p_church_id,
         zone_id = p_zone_id,
         name = coalesce(nullif(trim(p_name), ''), 'Skjerm'),
         device_token_hash = p_device_token_hash,
         staged_device_token = p_staged_token,
         pairing_code = null,
         pairing_code_expires_at = null
   where pairing_code = upper(p_code)
     and status = 'pending'
     and pairing_code_expires_at > now()
  returning id into v_id;

  if v_id is null then
    raise exception 'code_not_found';
  end if;
  return v_id;
end $$;

-- TV polls (anon via API) until claimed; the plaintext token is delivered
-- exactly once, then cleared.
create or replace function info.pairing_poll(p_poll_key_hash text)
returns jsonb
language plpgsql
security definer set search_path = info, public
as $$
declare
  v_screen info.screen%rowtype;
  v_token  text;
begin
  select * into v_screen from info.screen
    where pairing_poll_key_hash = p_poll_key_hash;
  if not found then
    raise exception 'pairing_not_found';
  end if;

  if v_screen.status = 'pending' then
    if v_screen.pairing_code_expires_at < now() then
      raise exception 'pairing_expired';
    end if;
    return jsonb_build_object('status', 'pending');
  end if;

  if v_screen.status = 'paired' and v_screen.staged_device_token is not null then
    v_token := v_screen.staged_device_token;
    update info.screen
       set staged_device_token = null, pairing_poll_key_hash = null
     where id = v_screen.id;
    return jsonb_build_object('status', 'paired', 'deviceToken', v_token);
  end if;

  -- Claimed but token already delivered (or revoked) — the poll key is spent.
  raise exception 'pairing_consumed';
end $$;

-- Display heartbeat: authenticates by token hash, records liveness, returns
-- the current version + any active emergency so the 30 s poll alone is enough
-- to drive the screen even without realtime.
create or replace function info.heartbeat(p_token_hash text, p_user_agent text)
returns jsonb
language plpgsql
security definer set search_path = info, public
as $$
declare
  v_screen info.screen%rowtype;
begin
  select * into v_screen from info.screen
    where device_token_hash = p_token_hash and status = 'paired';
  if not found then
    raise exception 'screen_not_paired';
  end if;

  update info.screen
     set last_seen_at = now(),
         last_user_agent = left(coalesce(p_user_agent, ''), 300)
   where id = v_screen.id;

  return jsonb_build_object(
    'screenId', v_screen.id,
    'zoneId', v_screen.zone_id,
    'version', case when v_screen.zone_id is null then null
                    else info.snapshot_version(v_screen.zone_id) end,
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

-- Snapshot keyed by device token (what /api/display/snapshot calls).
create or replace function info.get_screen_snapshot(p_token_hash text)
returns jsonb
language plpgsql stable
security definer set search_path = info, public
as $$
declare
  v_screen info.screen%rowtype;
begin
  select * into v_screen from info.screen
    where device_token_hash = p_token_hash and status = 'paired';
  if not found then
    raise exception 'screen_not_paired';
  end if;
  if v_screen.zone_id is null then
    return jsonb_build_object('zone', null, 'screenId', v_screen.id,
                              'screenName', v_screen.name);
  end if;
  return info.get_zone_snapshot(v_screen.zone_id)
         || jsonb_build_object('screenId', v_screen.id, 'screenName', v_screen.name);
end $$;
