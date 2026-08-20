-- Centrum Service: redundant multi-monitor agents.
--
-- Service nodes stay simple targets in public.nodes. Monitoring routers live in
-- monitor_agents and may watch overlapping sets of nodes through the many-to-many
-- monitor_agent_targets table. A node is considered reachable when ANY fresh,
-- enabled assigned monitor reports it up.

begin;

create table if not exists public.monitor_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  router_ip inet,
  credential_hash text not null unique,
  enabled boolean not null default true,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitor_agents_name_not_blank check (length(btrim(name)) > 0),
  constraint monitor_agents_credential_hash_shape check (credential_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists monitor_agents_enabled_idx
  on public.monitor_agents (enabled)
  where enabled = true;

create index if not exists monitor_agents_router_ip_idx
  on public.monitor_agents (router_ip)
  where router_ip is not null;

create table if not exists public.monitor_agent_targets (
  agent_id uuid not null references public.monitor_agents(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, node_id)
);

create index if not exists monitor_agent_targets_node_idx
  on public.monitor_agent_targets (node_id, agent_id);

create table if not exists public.monitor_probe_results (
  agent_id uuid not null,
  node_id uuid not null,
  status text not null default 'unknown',
  latency_ms integer,
  reported_at timestamptz not null default now(),
  primary key (agent_id, node_id),
  constraint monitor_probe_results_assignment_fkey
    foreign key (agent_id, node_id)
    references public.monitor_agent_targets(agent_id, node_id)
    on delete cascade,
  constraint monitor_probe_results_status_check
    check (status in ('up', 'down', 'unknown')),
  constraint monitor_probe_results_latency_check
    check (latency_ms is null or latency_ms >= 0)
);

create index if not exists monitor_probe_results_node_reported_idx
  on public.monitor_probe_results (node_id, reported_at desc);

-- Keep agent updated_at automatic without exposing a callable helper API.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.centrum_monitor_agent_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.centrum_monitor_agent_set_updated_at() from public, anon, authenticated;

drop trigger if exists centrum_monitor_agents_set_updated_at on public.monitor_agents;
create trigger centrum_monitor_agents_set_updated_at
before update on public.monitor_agents
for each row execute function private.centrum_monitor_agent_set_updated_at();

-- Aggregate overlapping monitor reports into the existing public.nodes snapshot.
-- Redundancy rule: any fresh UP wins. If none are UP but at least one fresh DOWN
-- exists, the node is DOWN. With no fresh reports, the node is UNKNOWN/stale.
create or replace function private.centrum_recompute_node_monitor_state(p_node_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  fresh_up_count integer := 0;
  fresh_down_count integer := 0;
  latest_report timestamptz;
  latest_up timestamptz;
  best_latency integer;
  resolved_status text := 'unknown';
begin
  select
    count(*) filter (
      where r.reported_at >= now() - interval '150 seconds'
        and r.status = 'up'
    )::integer,
    count(*) filter (
      where r.reported_at >= now() - interval '150 seconds'
        and r.status = 'down'
    )::integer,
    max(r.reported_at),
    max(r.reported_at) filter (
      where r.reported_at >= now() - interval '150 seconds'
        and r.status = 'up'
    ),
    min(r.latency_ms) filter (
      where r.reported_at >= now() - interval '150 seconds'
        and r.status = 'up'
        and r.latency_ms is not null
    )
  into fresh_up_count, fresh_down_count, latest_report, latest_up, best_latency
  from public.monitor_probe_results r
  join public.monitor_agents a on a.id = r.agent_id and a.enabled = true
  join public.monitor_agent_targets t
    on t.agent_id = r.agent_id
   and t.node_id = r.node_id
  where r.node_id = p_node_id;

  if fresh_up_count > 0 then
    resolved_status := 'up';
  elsif fresh_down_count > 0 then
    resolved_status := 'down';
  else
    resolved_status := 'unknown';
  end if;

  update public.nodes n
  set
    probe_status = resolved_status,
    latency_ms = case when resolved_status = 'up' then best_latency else null end,
    last_checked_at = latest_report,
    last_seen_at = case
      when latest_up is null then n.last_seen_at
      when n.last_seen_at is null then latest_up
      else greatest(n.last_seen_at, latest_up)
    end
  where n.id = p_node_id;
end;
$$;

revoke all on function private.centrum_recompute_node_monitor_state(uuid) from public, anon, authenticated;

create or replace function private.centrum_probe_result_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.centrum_recompute_node_monitor_state(coalesce(new.node_id, old.node_id));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.centrum_probe_result_changed() from public, anon, authenticated;

drop trigger if exists centrum_probe_result_changed on public.monitor_probe_results;
create trigger centrum_probe_result_changed
after insert or update or delete on public.monitor_probe_results
for each row execute function private.centrum_probe_result_changed();

create or replace function private.centrum_monitor_assignment_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.centrum_recompute_node_monitor_state(coalesce(new.node_id, old.node_id));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.centrum_monitor_assignment_changed() from public, anon, authenticated;

drop trigger if exists centrum_monitor_assignment_changed on public.monitor_agent_targets;
create trigger centrum_monitor_assignment_changed
after insert or delete on public.monitor_agent_targets
for each row execute function private.centrum_monitor_assignment_changed();

create or replace function private.centrum_monitor_agent_enabled_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_node_id uuid;
begin
  if old.enabled is distinct from new.enabled then
    for target_node_id in
      select t.node_id
      from public.monitor_agent_targets t
      where t.agent_id = new.id
    loop
      perform private.centrum_recompute_node_monitor_state(target_node_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.centrum_monitor_agent_enabled_changed() from public, anon, authenticated;

drop trigger if exists centrum_monitor_agent_enabled_changed on public.monitor_agents;
create trigger centrum_monitor_agent_enabled_changed
after update of enabled on public.monitor_agents
for each row execute function private.centrum_monitor_agent_enabled_changed();

-- Admin browser access is explicit and RLS-protected. No customer/anonymous access.
alter table public.monitor_agents enable row level security;
alter table public.monitor_agent_targets enable row level security;
alter table public.monitor_probe_results enable row level security;

revoke all on table public.monitor_agents from public, anon, authenticated;
revoke all on table public.monitor_agent_targets from public, anon, authenticated;
revoke all on table public.monitor_probe_results from public, anon, authenticated;

grant select, insert, update, delete on table public.monitor_agents to authenticated;
grant select, insert, update, delete on table public.monitor_agent_targets to authenticated;
grant select on table public.monitor_probe_results to authenticated;

grant select, insert, update, delete on table public.monitor_agents to service_role;
grant select, insert, update, delete on table public.monitor_agent_targets to service_role;
grant select, insert, update, delete on table public.monitor_probe_results to service_role;

drop policy if exists "Admins can manage monitor agents" on public.monitor_agents;
create policy "Admins can manage monitor agents"
on public.monitor_agents for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can manage monitor targets" on public.monitor_agent_targets;
create policy "Admins can manage monitor targets"
on public.monitor_agent_targets for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can view monitor results" on public.monitor_probe_results;
create policy "Admins can view monitor results"
on public.monitor_probe_results for select
to authenticated
using ((select public.is_admin()));

-- Bootstrap the router that is already running the legacy Centrum script.
-- This value is the SHA-256 hash of the credential already installed on 10.0.6.2;
-- the plaintext credential is intentionally not stored in this migration.
insert into public.monitor_agents (
  name,
  router_ip,
  credential_hash,
  enabled,
  last_heartbeat_at
)
select
  'Main Monitor',
  '10.0.6.2'::inet,
  '2a1b0a8f6f86176aa5d54c7d1d9a1d62d5ede21118fa9d28fe28ba88f09ecaca',
  true,
  nullif((select s.value from public.system_settings s where s.key = 'monitor_heartbeat_at'), '')::timestamptz
on conflict (credential_hash) do update
set
  router_ip = excluded.router_ip,
  enabled = true,
  last_heartbeat_at = coalesce(public.monitor_agents.last_heartbeat_at, excluded.last_heartbeat_at);

-- Preserve current behavior during migration: the existing main monitor starts
-- assigned to every currently-enabled node. Future nodes are deliberately NOT
-- auto-assigned; admins choose reachable monitors in the new UI.
insert into public.monitor_agent_targets (agent_id, node_id)
select a.id, n.id
from public.monitor_agents a
cross join public.nodes n
where a.credential_hash = '2a1b0a8f6f86176aa5d54c7d1d9a1d62d5ede21118fa9d28fe28ba88f09ecaca'
  and n.monitor_enabled = true
  and n.monitor_ip is not null
on conflict (agent_id, node_id) do nothing;

-- Seed the first per-agent snapshot from the existing single-monitor node state
-- so the cut-over does not discard the most recent known result.
insert into public.monitor_probe_results (agent_id, node_id, status, latency_ms, reported_at)
select
  a.id,
  n.id,
  n.probe_status,
  n.latency_ms,
  n.last_checked_at
from public.monitor_agents a
cross join public.nodes n
where a.credential_hash = '2a1b0a8f6f86176aa5d54c7d1d9a1d62d5ede21118fa9d28fe28ba88f09ecaca'
  and n.monitor_enabled = true
  and n.monitor_ip is not null
  and n.last_checked_at is not null
on conflict (agent_id, node_id) do update
set
  status = excluded.status,
  latency_ms = excluded.latency_ms,
  reported_at = excluded.reported_at;

-- Customer-safe status now uses the freshest heartbeat from monitoring agents
-- actually assigned to that customer's node instead of a single global monitor.
create or replace function public.get_my_network_status()
returns table (
  node_id uuid,
  node_name text,
  monitor_enabled boolean,
  probe_status text,
  latency_ms integer,
  last_checked_at timestamptz,
  last_seen_at timestamptz,
  maintenance_mode boolean,
  maintenance_message text,
  global_maintenance boolean,
  monitor_heartbeat_at text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.node_id,
    n.name,
    coalesce(n.monitor_enabled, false),
    coalesce(n.probe_status, 'unknown'),
    n.latency_ms,
    n.last_checked_at,
    n.last_seen_at,
    coalesce(n.maintenance_mode, false),
    n.maintenance_message,
    coalesce((
      select lower(s.value) = 'true'
      from public.system_settings s
      where s.key = 'global_maintenance'
    ), false),
    (
      select max(a.last_heartbeat_at)::text
      from public.monitor_agent_targets t
      join public.monitor_agents a on a.id = t.agent_id
      where t.node_id = n.id
        and a.enabled = true
    )
  from public.profiles p
  left join public.nodes n on n.id = p.node_id
  where p.id = (select auth.uid());
$$;

revoke all on function public.get_my_network_status() from public, anon;
grant execute on function public.get_my_network_status() to authenticated, service_role;

-- Public status is derived from aggregated node results. One unrelated live
-- monitor can no longer make the whole system appear healthy.
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
  with settings as (
    select coalesce(
      (select lower(s.value) = 'true' from public.system_settings s where s.key = 'global_maintenance'),
      false
    ) as global_maintenance
  ), node_summary as (
    select
      count(*)::integer as monitored_count,
      count(*) filter (
        where n.last_checked_at >= now() - interval '150 seconds'
          and n.probe_status = 'up'
      )::integer as up_count,
      count(*) filter (
        where n.last_checked_at >= now() - interval '150 seconds'
          and n.probe_status = 'down'
      )::integer as down_count,
      max(n.last_checked_at) as latest_node_check
    from public.nodes n
    where n.monitor_enabled = true
      and n.monitor_ip is not null
  ), agent_summary as (
    select
      count(*)::integer as enabled_count,
      count(*) filter (
        where a.last_heartbeat_at >= now() - interval '150 seconds'
      )::integer as fresh_count,
      max(a.last_heartbeat_at) as latest_agent_heartbeat
    from public.monitor_agents a
    where a.enabled = true
  ), resolved as (
    select
      case
        when s.global_maintenance then 'Maintenance'
        when n.monitored_count = 0 then 'Monitoring Pending'
        when n.down_count = n.monitored_count then 'Network Outage'
        when n.down_count > 0 then 'Partial Outage'
        when n.up_count = n.monitored_count then 'Operational'
        when n.up_count = 0
          and n.down_count = 0
          and a.enabled_count > 0
          and a.fresh_count = 0
          and a.latest_agent_heartbeat is not null then 'Monitoring Unavailable'
        else 'Monitoring Pending'
      end as resolved_status,
      case
        when n.latest_node_check is null then a.latest_agent_heartbeat
        when a.latest_agent_heartbeat is null then n.latest_node_check
        else greatest(n.latest_node_check, a.latest_agent_heartbeat)
      end as latest_update
    from settings s
    cross join node_summary n
    cross join agent_summary a
  )
  select
    r.resolved_status as status,
    case r.resolved_status
      when 'Operational' then 'All monitored Centrum network nodes are responding normally.'
      when 'Partial Outage' then 'Some monitored service areas are currently experiencing an interruption.'
      when 'Network Outage' then 'Centrum is detecting a wider network interruption.'
      when 'Maintenance' then 'Centrum network maintenance is currently in progress.'
      when 'Monitoring Unavailable' then 'Live network monitoring is temporarily unavailable.'
      else 'Centrum is waiting for fresh monitoring data.'
    end as message,
    r.latest_update as updated_at
  from resolved r;
$$;

revoke all on function public.get_public_network_status() from public;
revoke all on function public.get_public_network_status() from anon;
revoke all on function public.get_public_network_status() from authenticated;
grant execute on function public.get_public_network_status() to anon, authenticated, service_role;

commit;
