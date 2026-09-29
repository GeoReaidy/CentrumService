-- Centrum Service
-- Simple/Advanced customer portal preference + quieter plan fields.
-- 2026-08-29

begin;

create table if not exists public.customer_portal_preferences (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  portal_mode text not null default 'simple'
    check (portal_mode in ('simple', 'advanced'))
);

alter table public.customer_portal_preferences enable row level security;

revoke all on table public.customer_portal_preferences from public;
revoke all on table public.customer_portal_preferences from anon;
revoke all on table public.customer_portal_preferences from authenticated;
grant select, insert, update on table public.customer_portal_preferences to authenticated;

drop policy if exists "customer_portal_preferences_select_own" on public.customer_portal_preferences;
create policy "customer_portal_preferences_select_own"
on public.customer_portal_preferences
for select
to authenticated
using (customer_id = (select auth.uid()));

drop policy if exists "customer_portal_preferences_insert_own" on public.customer_portal_preferences;
create policy "customer_portal_preferences_insert_own"
on public.customer_portal_preferences
for insert
to authenticated
with check (customer_id = (select auth.uid()));

drop policy if exists "customer_portal_preferences_update_own" on public.customer_portal_preferences;
create policy "customer_portal_preferences_update_own"
on public.customer_portal_preferences
for update
to authenticated
using (customer_id = (select auth.uid()))
with check (customer_id = (select auth.uid()));

alter table public.plans
  alter column speed_down_mbps drop not null,
  alter column speed_up_mbps drop not null;

alter table public.plans
  add column if not exists description text;

alter table public.plans
  drop constraint if exists plans_speed_down_positive,
  drop constraint if exists plans_speed_up_positive,
  drop constraint if exists plans_description_short_single_line;

alter table public.plans
  add constraint plans_speed_down_positive
    check (speed_down_mbps is null or speed_down_mbps > 0),
  add constraint plans_speed_up_positive
    check (speed_up_mbps is null or speed_up_mbps > 0),
  add constraint plans_description_short_single_line
    check (
      description is null
      or (
        char_length(description) between 1 and 160
        and description !~ E'[\r\n]'
      )
    );

commit;
