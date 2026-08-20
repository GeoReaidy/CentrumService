-- Fix admin-side deletion / assignment operations for multi-monitor topology.
--
-- The first multi-monitor migration intentionally revoked direct execution of
-- private helper functions. Trigger wrappers must therefore execute with the
-- migration owner's privileges; otherwise browser-admin deletes can reach a
-- cascade trigger and fail with "permission denied for function ...".

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
