alter table public.inventory_batches
add column if not exists tracks_opened_state boolean not null default false;

update public.inventory_batches
set tracks_opened_state = true,
    consume_within_days_after_opening = coalesce(consume_within_days_after_opening, 30)
where consume_within_days_after_opening is not null
   or lower(name) like any (array[
     '%salsa%',
     '%piri-piri%',
     '%piripiri%',
     '%pepinill%',
     '%encurtid%',
     '%aceituna%',
     '%mayonesa%',
     '%mostaza%',
     '%ketchup%',
     '%mermelada%'
   ]);

create or replace function public.open_inventory_item(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_batches%rowtype;
  v_opened_id uuid;
begin
  select * into v_item from public.inventory_batches where id = p_batch_id for update;
  if not found or not public.is_household_member(v_item.household_id) then raise exception 'not_allowed'; end if;
  if v_item.opened_on is not null then return v_item.id; end if;
  if not v_item.tracks_opened_state then raise exception 'opening_not_applicable'; end if;
  if v_item.unit in ('unit', 'pack') and v_item.quantity > 1 then
    update public.inventory_batches set quantity = quantity - 1 where id = p_batch_id;
    insert into public.inventory_batches (
      household_id, source_batch_id, name, quantity, initial_quantity, unit, purchased_on, expires_on,
      expiry_kind, expiry_precision, storage_location, tracks_opened_state, opened_on,
      consume_within_days_after_opening, notes, status, created_by
    ) values (
      v_item.household_id, coalesce(v_item.source_batch_id, v_item.id), v_item.name, 1, 1, v_item.unit,
      v_item.purchased_on, v_item.expires_on, v_item.expiry_kind, v_item.expiry_precision,
      v_item.storage_location, true, current_date, v_item.consume_within_days_after_opening,
      v_item.notes, 'active', auth.uid()
    ) returning id into v_opened_id;
  else
    update public.inventory_batches set opened_on = current_date where id = p_batch_id returning id into v_opened_id;
  end if;
  insert into public.inventory_events (household_id, batch_id, user_id, action, item_name, detail)
  values (v_item.household_id, v_opened_id, auth.uid(), 'opened', v_item.name,
    case when v_item.quantity > 1 then 'Abrió una unidad' else 'Marcó el producto como abierto' end);
  return v_opened_id;
end;
$$;

create or replace function public.use_open_inventory_item(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_batches%rowtype;
begin
  select * into v_item from public.inventory_batches where id = p_batch_id;
  if not found
    or not public.is_household_member(v_item.household_id)
    or v_item.status <> 'active'
    or v_item.quantity <= 0
    or not v_item.tracks_opened_state
    or v_item.opened_on is null
  then
    raise exception 'not_allowed';
  end if;

  insert into public.inventory_events (
    household_id, batch_id, user_id, action, item_name, detail, quantity_delta, metadata
  ) values (
    v_item.household_id,
    v_item.id,
    auth.uid(),
    'consumed',
    v_item.name,
    'Usó un poco; el envase sigue abierto',
    0,
    jsonb_build_object('partial_use', true)
  );
end;
$$;

grant execute on function public.open_inventory_item(uuid) to authenticated;
grant execute on function public.use_open_inventory_item(uuid) to authenticated;
revoke all on function public.open_inventory_item(uuid) from public;
revoke all on function public.use_open_inventory_item(uuid) from public;
