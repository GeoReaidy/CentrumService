-- Allow the internal live-chat message trigger to refresh session.updated_at
-- without allowing customers to modify protected session fields directly.
-- Applied to production as migration 20260820183840.

create or replace function public.guard_live_chat_session_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- public.touch_live_chat_session() is SECURITY DEFINER and owned by postgres.
  -- Its nested UPDATE reaches this guard with current_user = postgres.
  if current_user = 'postgres' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if auth.uid() is null or old.customer_id <> auth.uid() then
    raise exception 'not allowed';
  end if;

  if new.id is distinct from old.id
     or new.customer_id is distinct from old.customer_id
     or new.started_at is distinct from old.started_at
     or new.updated_at is distinct from old.updated_at then
    raise exception 'customers may only close a live chat';
  end if;

  if old.status <> 'open' or new.status <> 'closed' then
    raise exception 'customers may only close a live chat';
  end if;

  return new;
end;
$$;
