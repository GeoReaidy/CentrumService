begin;

-- Centrum Service V1 items 1 + 3
-- 1) Repair known account-owned foreign keys so deleting auth.users can complete.
-- 3) Expose a tiny, public-safe network-status RPC for anon + authenticated users.

-- ---------------------------------------------------------------------------
-- 1. AUTH USER DELETION RELATIONSHIPS
-- ---------------------------------------------------------------------------
-- The app's customer-owned data is tied to auth.users. These known tables are
-- intentionally removed when a portal account is hard-deleted. Public contact
-- and customization inquiries keep their business record but lose the auth
-- user link.
--
-- This block only changes an FK when the existing single-column FK actually
-- references auth.users(id). It does not invent relationships for tables that
-- do not already have them.

-- Payment history is retained for accounting, but the deleted Auth identity is
-- detached from it. The admin UI patch labels those rows as "Deleted account".
do $$
begin
  if to_regclass('public.payments') is not null and exists (
    select 1
    from pg_attribute
    where attrelid = 'public.payments'::regclass
      and attname = 'customer_id'
      and not attisdropped
  ) then
    alter table public.payments alter column customer_id drop not null;
  end if;
end $$;

do $$
declare
  target record;
  fk record;
  target_rel regclass;
  local_attnum smallint;
  changed boolean;
  new_constraint_name text;
begin
  for target in
    select *
    from (values
      ('profiles',                       'id',          'CASCADE'),
      ('tickets',                        'customer_id', 'CASCADE'),
      ('payments',                       'customer_id', 'SET NULL'),
      ('service_requests',               'customer_id', 'CASCADE'),
      ('live_chat_sessions',             'customer_id', 'CASCADE'),
      ('live_chat_messages',             'sender_id',   'CASCADE'),
      ('contact_inquiries',               'customer_id', 'SET NULL'),
      ('service_customization_requests',  'customer_id', 'SET NULL')
    ) as x(table_name, column_name, delete_action)
  loop
    target_rel := to_regclass(format('public.%I', target.table_name));
    if target_rel is null then
      continue;
    end if;

    select a.attnum
      into local_attnum
    from pg_attribute a
    where a.attrelid = target_rel
      and a.attname = target.column_name
      and not a.attisdropped;

    if local_attnum is null then
      continue;
    end if;

    changed := false;

    for fk in
      select c.conname
      from pg_constraint c
      where c.contype = 'f'
        and c.conrelid = target_rel
        and c.confrelid = 'auth.users'::regclass
        and array_length(c.conkey, 1) = 1
        and c.conkey[1] = local_attnum
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        target.table_name,
        fk.conname
      );
      changed := true;
    end loop;

    if changed then
      new_constraint_name := format(
        'centrum_%s_%s_auth_users_fkey',
        target.table_name,
        target.column_name
      );

      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s',
        target.table_name,
        new_constraint_name,
        target.column_name,
        target.delete_action
      );

      raise notice 'Updated %.% -> auth.users ON DELETE %',
        target.table_name, target.column_name, target.delete_action;
    end if;
  end loop;
end $$;

-- Warn about any remaining restrictive FKs that reference auth.users. This is
-- intentionally a WARNING, not an exception: it lets the known Centrum fixes
-- apply while still surfacing an unexpected schema relationship for review.
do $$
declare
  blocker record;
begin
  for blocker in
    select
      n.nspname as table_schema,
      cls.relname as table_name,
      c.conname as constraint_name,
      case c.confdeltype
        when 'a' then 'NO ACTION'
        when 'r' then 'RESTRICT'
        else c.confdeltype::text
      end as delete_rule
    from pg_constraint c
    join pg_class cls on cls.oid = c.conrelid
    join pg_namespace n on n.oid = cls.relnamespace
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype in ('a', 'r')
  loop
    raise warning 'Potential auth user deletion blocker: %.% constraint % uses %',
      blocker.table_schema,
      blocker.table_name,
      blocker.constraint_name,
      blocker.delete_rule;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. PUBLIC-SAFE GLOBAL NETWORK STATUS
-- ---------------------------------------------------------------------------
-- Do not grant anonymous users SELECT access to system_settings or nodes.
-- Instead expose only the final global label/message/heartbeat timestamp.

create or replace function public.get_public_network_status()
returns table (
  status text,
  message text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with raw as (
    select
      max(s.value) filter (where s.key = 'network_status') as stored_status,
      max(s.value) filter (where s.key = 'global_maintenance') as maintenance_value,
      max(s.value) filter (where s.key = 'monitor_heartbeat_at') as heartbeat_value
    from public.system_settings s
    where s.key in ('network_status', 'global_maintenance', 'monitor_heartbeat_at')
  ), normalized as (
    select
      stored_status,
      lower(coalesce(maintenance_value, 'false')) = 'true' as global_maintenance,
      case
        when nullif(heartbeat_value, '') is null then null
        else heartbeat_value::timestamptz
      end as heartbeat_at
    from raw
  ), resolved as (
    select
      case
        when global_maintenance then 'Maintenance'
        when heartbeat_at is null then 'Monitoring Pending'
        when heartbeat_at < now() - interval '150 seconds' then 'Monitoring Unavailable'
        when stored_status in (
          'Operational',
          'Partial Outage',
          'Network Outage',
          'Maintenance',
          'Monitoring Unavailable',
          'Monitoring Pending'
        ) then stored_status
        else 'Monitoring Pending'
      end as status,
      heartbeat_at
    from normalized
  )
  select
    r.status,
    case r.status
      when 'Operational' then 'All monitored Centrum network nodes are responding normally.'
      when 'Partial Outage' then 'Some monitored service areas are currently experiencing an interruption.'
      when 'Network Outage' then 'Centrum is detecting a wider network interruption.'
      when 'Maintenance' then 'Centrum network maintenance is currently in progress.'
      when 'Monitoring Unavailable' then 'Live network monitoring is temporarily unavailable.'
      else 'Centrum is waiting for fresh monitoring data.'
    end as message,
    r.heartbeat_at as updated_at
  from resolved r;
$$;

revoke all on function public.get_public_network_status() from public;
revoke all on function public.get_public_network_status() from anon;
revoke all on function public.get_public_network_status() from authenticated;
grant execute on function public.get_public_network_status() to anon, authenticated;

commit;
