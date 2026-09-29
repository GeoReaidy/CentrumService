begin;

create table if not exists public.customer_locations (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision null check (accuracy_m is null or accuracy_m >= 0),
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_locations enable row level security;

revoke all on table public.customer_locations from anon, authenticated;
grant select, insert, update, delete on table public.customer_locations to authenticated;
grant all on table public.customer_locations to service_role;

drop policy if exists "Customers can read own location" on public.customer_locations;
create policy "Customers can read own location"
on public.customer_locations for select
to authenticated
using ((select auth.uid()) = customer_id);

drop policy if exists "Customers can create own location" on public.customer_locations;
create policy "Customers can create own location"
on public.customer_locations for insert
to authenticated
with check ((select auth.uid()) = customer_id);

drop policy if exists "Customers can update own location" on public.customer_locations;
create policy "Customers can update own location"
on public.customer_locations for update
to authenticated
using ((select auth.uid()) = customer_id)
with check ((select auth.uid()) = customer_id);

drop policy if exists "Customers can delete own location" on public.customer_locations;
create policy "Customers can delete own location"
on public.customer_locations for delete
to authenticated
using ((select auth.uid()) = customer_id);

drop policy if exists "Staff can read customer locations" on public.customer_locations;
create policy "Staff can read customer locations"
on public.customer_locations for select
to authenticated
using ((select public.is_admin()) or (select public.is_manager()));

alter table public.service_requests
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists location_accuracy_m double precision,
  add column if not exists location_captured_at timestamptz;

alter table public.service_requests
  drop constraint if exists service_requests_location_latitude_check,
  add constraint service_requests_location_latitude_check check (location_latitude is null or location_latitude between -90 and 90),
  drop constraint if exists service_requests_location_longitude_check,
  add constraint service_requests_location_longitude_check check (location_longitude is null or location_longitude between -180 and 180),
  drop constraint if exists service_requests_location_accuracy_m_check,
  add constraint service_requests_location_accuracy_m_check check (location_accuracy_m is null or location_accuracy_m >= 0),
  drop constraint if exists service_requests_location_pair_check,
  add constraint service_requests_location_pair_check check ((location_latitude is null) = (location_longitude is null));

alter table public.service_customization_requests
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists location_accuracy_m double precision,
  add column if not exists location_captured_at timestamptz;

alter table public.service_customization_requests
  drop constraint if exists service_customization_location_latitude_check,
  add constraint service_customization_location_latitude_check check (location_latitude is null or location_latitude between -90 and 90),
  drop constraint if exists service_customization_location_longitude_check,
  add constraint service_customization_location_longitude_check check (location_longitude is null or location_longitude between -180 and 180),
  drop constraint if exists service_customization_location_accuracy_m_check,
  add constraint service_customization_location_accuracy_m_check check (location_accuracy_m is null or location_accuracy_m >= 0),
  drop constraint if exists service_customization_location_pair_check,
  add constraint service_customization_location_pair_check check ((location_latitude is null) = (location_longitude is null));

commit;
