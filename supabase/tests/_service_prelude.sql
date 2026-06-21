-- Optional SundayPlan sibling, for SundayInfo's service-signage test ONLY.
-- SundayInfo does NOT own the `public` service tables (SundayPlan does, in the
-- same Supabase project). We recreate the MINIMAL slice the signage contract
-- needs — public.service + public.service_item — plus the EXACT
-- public.service_signage_board RPC from SundayPlan migration 0026, so the DB
-- test exercises the real feed shape SundayInfo consumes. Keep the function
-- VERBATIM in sync with SundayPlan 0026.

create table if not exists public.service (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.church(id) on delete cascade,
  name          text not null,
  starts_at_utc timestamptz not null,
  state         text not null default 'draft'
                check (state in ('draft','published','in_progress','played','archived'))
);

create table if not exists public.service_item (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references public.service(id) on delete cascade,
  position     int not null,
  label        text not null,
  kind         text not null
               check (kind in ('welcome','song','scripture','sermon','announcement','gap')),
  duration_min int not null default 0,
  unique (service_id, position)
);

-- ── public.service_signage_board (verbatim from SundayPlan 0026) ──────────────
create or replace function public.service_signage_board(
  p_church_id uuid,
  p_now timestamptz default now()
) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with svc as (
    select s.id, s.name, s.starts_at_utc
      from public.service s
     where s.church_id = p_church_id
       and s.state in ('published','in_progress')
       and s.starts_at_utc >= p_now - interval '3 hours'
       and s.starts_at_utc <  p_now + interval '7 days'
     order by s.starts_at_utc
     limit 1
  )
  select jsonb_build_object(
           'service_id', svc.id,
           'name',       svc.name,
           'starts',     svc.starts_at_utc,
           'items', coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'position',     si.position,
                        'label',        si.label,
                        'kind',         si.kind,
                        'duration_min', si.duration_min)
                      order by si.position)
               from public.service_item si
              where si.service_id = svc.id
           ), '[]'::jsonb)
         )
    from svc;
$$;

revoke execute on function public.service_signage_board(uuid, timestamptz) from public;
grant  execute on function public.service_signage_board(uuid, timestamptz) to service_role;
