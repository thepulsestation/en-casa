create or replace function public.restore_consumed_inventory_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.inventory_events%rowtype;
  v_item public.inventory_batches%rowtype;
  v_amount numeric;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_event from public.inventory_events where id = p_event_id for update;
  if not found
    or v_event.action <> 'consumed'
    or not public.is_household_member(v_event.household_id)
  then
    raise exception 'not_allowed';
  end if;
  if v_event.metadata ? 'restored_at' then raise exception 'already_restored'; end if;
  if v_event.batch_id is null or coalesce(v_event.quantity_delta, 0) >= 0 then
    raise exception 'not_restorable';
  end if;

  select * into v_item from public.inventory_batches where id = v_event.batch_id for update;
  if not found or v_item.household_id <> v_event.household_id or v_item.status = 'discarded' then
    raise exception 'not_restorable';
  end if;

  v_amount := abs(v_event.quantity_delta);
  update public.inventory_batches
  set quantity = quantity + v_amount,
      status = 'active',
      updated_at = now()
  where id = v_item.id;

  update public.inventory_events
  set metadata = metadata || jsonb_build_object(
    'restored_at', now(),
    'restored_by', auth.uid()
  )
  where id = v_event.id;

  insert into public.inventory_events (
    household_id, batch_id, user_id, action, item_name, detail, quantity_delta, metadata
  ) values (
    v_event.household_id,
    v_item.id,
    auth.uid(),
    'updated',
    v_event.item_name,
    'Deshizo el consumo de ' || v_amount::text || ' ' || v_item.unit::text,
    v_amount,
    jsonb_build_object('restores_event_id', v_event.id)
  );
end;
$$;

create or replace view public.inventory_activity_feed
with (security_invoker = true)
as
select
  e.id,
  e.household_id,
  e.batch_id,
  e.action,
  e.item_name,
  e.detail,
  e.created_at,
  coalesce(p.full_name, 'Alguien de casa') as actor_name,
  e.quantity_delta,
  e.metadata,
  b.status as batch_status
from public.inventory_events e
left join public.profiles p on p.id = e.user_id
left join public.inventory_batches b on b.id = e.batch_id;

grant select on public.inventory_activity_feed to authenticated;
grant execute on function public.restore_consumed_inventory_event(uuid) to authenticated;
revoke all on function public.restore_consumed_inventory_event(uuid) from public;
