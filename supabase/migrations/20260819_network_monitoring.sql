-- Centrum Service automatic node monitoring
-- Safe to run against the existing nodes table: it only adds monitoring fields.

begin;

alter table public.nodes
  add column if not exists monitor_ip inet,
  add column if not exists monitor_enabled boolean not null default false,
  add column if not exists probe_status text not null default 'unknown',
  add column if not exists latency_ms integer,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists maintenance_mode boolean not null default false,
  add column if not exists maintenance_message text,
  add column if not exists updated_at timestamptz not null default now();

-- Existing nodes without a target IP should not count against network health.
update public.nodes
set monitor_enabled = false
where monitor_ip is null;

-- Prevent impossible status values and obviously invalid latency values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nodes_probe_status_check'
      and conrelid = 'public.nodes'::regclass
  ) then
    alter table public.nodes
      add constraint nodes_probe_status_check
      check (probe_status in ('up', 'down', 'unknown'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'nodes_latency_ms_check'
      and conrelid = 'public.nodes'::regclass
  ) then
    alter table public.nodes
      add constraint nodes_latency_ms_check
      check (latency_ms is null or latency_ms >= 0);
  end if;
end $$;

create unique index if not exists nodes_monitor_ip_unique
  on public.nodes (monitor_ip)
  where monitor_ip is not null;

create index if not exists nodes_monitor_enabled_idx
  on public.nodes (monitor_enabled)
  where monitor_enabled = true;

create or replace function public.centrum_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists centrum_nodes_set_updated_at on public.nodes;
create trigger centrum_nodes_set_updated_at
before update on public.nodes
for each row execute function public.centrum_set_updated_at();

-- Reuse the existing system_settings table so the public site does not need
-- direct access to every node. network_status is written automatically by
-- the monitor endpoint. global_maintenance is the only manual global override.
insert into public.system_settings (key, value)
values
  ('global_maintenance', 'false'),
  ('monitor_heartbeat_at', ''),
  ('network_status', 'Monitoring Pending')
on conflict (key) do nothing;

-- Replace the old manually controlled values with the new safe initial state.
update public.system_settings
set value = 'Monitoring Pending'
where key = 'network_status'
  and value in ('Optimal', 'Maintenance', 'Partial Outage');

commit;
