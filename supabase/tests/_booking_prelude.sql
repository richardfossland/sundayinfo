-- Optional booking sibling, for SundayInfo's facilities-feed test ONLY.
-- SundayInfo does NOT own the `booking` schema (SundayBooking does, in the same
-- Supabase project). We recreate the MINIMAL slice the signage contract needs —
-- the booking/resource/event_type/booking_resource tables plus the EXACT
-- `booking.displayable` view and `booking.signage_board` RPC from SundayBooking
-- migration 0023 — so the DB test exercises the real feed shape SundayInfo
-- consumes. Keep the view + function VERBATIM in sync with 0023.

create schema if not exists booking;
grant usage on schema booking to service_role;

create table if not exists booking.resource (
  id        uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.church(id) on delete cascade,
  kind      text not null check (kind in ('room','equipment','person','vehicle')),
  name      text not null
);

create table if not exists booking.event_type (
  id        uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.church(id) on delete cascade,
  name      text not null
);

create table if not exists booking.booking (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.church(id) on delete cascade,
  event_type_id   uuid references booking.event_type(id),
  title           text not null,
  starts_at_utc   timestamptz not null,
  ends_at_utc     timestamptz not null,
  status          text not null default 'pending',
  show_on_signage boolean not null default false
);

create table if not exists booking.booking_resource (
  booking_id  uuid not null references booking.booking(id) on delete cascade,
  resource_id uuid not null references booking.resource(id) on delete cascade,
  primary key (booking_id, resource_id)
);

-- ── booking.displayable (verbatim from SundayBooking 0023) ───────────────────
create or replace view booking.displayable as
  select
    b.id              as booking_id,
    b.church_id       as church_id,
    b.title           as title,
    b.starts_at_utc   as starts_at_utc,
    b.ends_at_utc     as ends_at_utc,
    b.event_type_id   as event_type_id,
    et.name           as event_type_name,
    loc.resource_id   as resource_id,
    loc.resource_name as resource_name
  from booking.booking b
  left join booking.event_type et on et.id = b.event_type_id
  left join lateral (
    select r.id as resource_id, r.name as resource_name
      from booking.booking_resource br
      join booking.resource r on r.id = br.resource_id
     where br.booking_id = b.id
     order by (r.kind = 'room') desc, r.name
     limit 1
  ) loc on true
  where b.status = 'approved'
    and b.show_on_signage = true;

grant select on booking.displayable to anon, authenticated, service_role;

-- ── booking.signage_board (verbatim from SundayBooking 0023) ─────────────────
create or replace function booking.signage_board(
  p_church_id uuid,
  p_now timestamptz default now()
) returns jsonb
language sql stable
security definer
set search_path = booking, public
as $$
  with rooms as (
    select distinct resource_id, resource_name
      from booking.displayable
     where church_id = p_church_id
       and resource_id is not null
       and ends_at_utc > p_now
  ),
  cur as (
    select distinct on (d.resource_id)
           d.resource_id, d.title, d.starts_at_utc, d.ends_at_utc, d.event_type_name
      from booking.displayable d
     where d.church_id = p_church_id
       and d.starts_at_utc <= p_now
       and d.ends_at_utc   >  p_now
     order by d.resource_id, d.starts_at_utc
  ),
  nxt as (
    select distinct on (d.resource_id)
           d.resource_id, d.title, d.starts_at_utc, d.ends_at_utc, d.event_type_name
      from booking.displayable d
     where d.church_id = p_church_id
       and d.starts_at_utc > p_now
     order by d.resource_id, d.starts_at_utc
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'resource_id',   rooms.resource_id,
             'resource_name', rooms.resource_name,
             'current', case when cur.resource_id is null then null else jsonb_build_object(
               'title', cur.title, 'starts', cur.starts_at_utc, 'ends', cur.ends_at_utc,
               'event_type', cur.event_type_name) end,
             'next', case when nxt.resource_id is null then null else jsonb_build_object(
               'title', nxt.title, 'starts', nxt.starts_at_utc, 'ends', nxt.ends_at_utc,
               'event_type', nxt.event_type_name) end
           )
           order by rooms.resource_name
         ), '[]'::jsonb)
    from rooms
    left join cur on cur.resource_id = rooms.resource_id
    left join nxt on nxt.resource_id = rooms.resource_id;
$$;

grant execute on function booking.signage_board(uuid, timestamptz) to authenticated, service_role;
