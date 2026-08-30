alter table public.inventory_batches
add column if not exists expiry_precision text not null default 'day';

alter table public.inventory_batches
drop constraint if exists inventory_batches_expiry_precision_check;

alter table public.inventory_batches
add constraint inventory_batches_expiry_precision_check
check (expiry_precision in ('day', 'month'));

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
  if v_item.unit in ('unit', 'pack') and v_item.quantity > 1 then
    update public.inventory_batches set quantity = quantity - 1 where id = p_batch_id;
    insert into public.inventory_batches (
      household_id, name, quantity, initial_quantity, unit, purchased_on, expires_on,
      expiry_kind, expiry_precision, storage_location, opened_on, consume_within_days_after_opening,
      notes, status, created_by
    ) values (
      v_item.household_id, v_item.name, 1, 1, v_item.unit, v_item.purchased_on, v_item.expires_on,
      v_item.expiry_kind, v_item.expiry_precision, v_item.storage_location, current_date, v_item.consume_within_days_after_opening,
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
