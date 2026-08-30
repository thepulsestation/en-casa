create extension if not exists pgcrypto;

create type public.household_role as enum ('owner', 'member');
create type public.inventory_unit as enum ('unit', 'g', 'kg', 'ml', 'l', 'pack');
create type public.storage_location as enum ('fridge', 'freezer', 'pantry', 'other');
create type public.expiry_kind as enum ('use_by', 'best_before', 'unknown');
create type public.inventory_status as enum ('active', 'consumed', 'discarded');
create type public.inventory_action as enum ('imported', 'created', 'opened', 'consumed', 'discarded', 'updated');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Alguien de casa' check (char_length(full_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  timezone text not null default 'Europe/Madrid',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.household_invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 10 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now()
);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  normalized_name text generated always as (lower(trim(name))) stored,
  quantity numeric(12,3) not null check (quantity >= 0),
  initial_quantity numeric(12,3) not null check (initial_quantity > 0),
  unit public.inventory_unit not null default 'unit',
  purchased_on date,
  expires_on date,
  expiry_kind public.expiry_kind not null default 'unknown',
  expiry_precision text not null default 'day' check (expiry_precision in ('day', 'month')),
  storage_location public.storage_location not null default 'pantry',
  opened_on date,
  consume_within_days_after_opening integer check (consume_within_days_after_opening between 1 and 365),
  notes text check (notes is null or char_length(notes) <= 500),
  status public.inventory_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  batch_id uuid references public.inventory_batches(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action public.inventory_action not null,
  item_name text not null,
  detail text not null,
  quantity_delta numeric(12,3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  reminder_days integer[] not null default array[3, 1, 0],
  daily_time time not null default '09:00',
  timezone text not null default 'Europe/Madrid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_date date not null,
  notification_kind text not null default 'expiry_digest',
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, user_id, notification_date, notification_kind)
);

create index inventory_batches_household_status_idx on public.inventory_batches (household_id, status);
create index inventory_batches_household_expiry_idx on public.inventory_batches (household_id, expires_on) where status = 'active';
create index inventory_events_household_created_idx on public.inventory_events (household_id, created_at desc);
create index push_subscriptions_user_idx on public.push_subscriptions (household_id, user_id) where enabled;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger households_touch_updated_at before update on public.households for each row execute function public.touch_updated_at();
create trigger inventory_batches_touch_updated_at before update on public.inventory_batches for each row execute function public.touch_updated_at();
create trigger notification_preferences_touch_updated_at before update on public.notification_preferences for each row execute function public.touch_updated_at();
create trigger push_subscriptions_touch_updated_at before update on public.push_subscriptions for each row execute function public.touch_updated_at();

create or replace function public.keep_inventory_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.household_id = old.household_id;
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  return new;
end;
$$;

create trigger inventory_batches_keep_ownership
before update on public.inventory_batches
for each row execute function public.keep_inventory_ownership();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'Alguien de casa'));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.shares_household_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Mi casa'), auth.uid())
  returning id into v_household_id;
  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, auth.uid(), 'owner');
  insert into public.notification_preferences (household_id, user_id)
  values (v_household_id, auth.uid());
  return v_household_id;
end;
$$;

create or replace function public.create_household_invite(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_household_owner(p_household_id) then raise exception 'owner_required'; end if;
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
    begin
      insert into public.household_invites (code, household_id, created_by)
      values (v_code, p_household_id, auth.uid());
      return v_code;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

create or replace function public.join_household(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.household_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_invite
  from public.household_invites
  where code = upper(trim(p_invite_code))
    and expires_at > now()
    and use_count < max_uses
  for update;
  if not found then raise exception 'invalid_invite'; end if;
  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;
  insert into public.notification_preferences (household_id, user_id)
  values (v_invite.household_id, auth.uid())
  on conflict (household_id, user_id) do nothing;
  update public.household_invites set use_count = use_count + 1 where code = v_invite.code;
  return v_invite.household_id;
end;
$$;

create or replace function public.consume_inventory_item(p_batch_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_batches%rowtype;
  v_new_quantity numeric;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  select * into v_item from public.inventory_batches where id = p_batch_id for update;
  if not found or not public.is_household_member(v_item.household_id) then raise exception 'not_allowed'; end if;
  v_new_quantity := greatest(0, v_item.quantity - p_amount);
  update public.inventory_batches
  set quantity = v_new_quantity,
      status = case when v_new_quantity = 0 then 'consumed'::public.inventory_status else status end
  where id = p_batch_id;
  insert into public.inventory_events (household_id, batch_id, user_id, action, item_name, detail, quantity_delta)
  values (v_item.household_id, p_batch_id, auth.uid(), 'consumed', v_item.name,
    'Consumió ' || least(p_amount, v_item.quantity)::text || ' ' || v_item.unit::text,
    -least(p_amount, v_item.quantity));
end;
$$;

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

create or replace function public.discard_inventory_item(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_batches%rowtype;
begin
  select * into v_item from public.inventory_batches where id = p_batch_id for update;
  if not found or not public.is_household_member(v_item.household_id) then raise exception 'not_allowed'; end if;
  update public.inventory_batches set status = 'discarded' where id = p_batch_id;
  insert into public.inventory_events (household_id, batch_id, user_id, action, item_name, detail, quantity_delta)
  values (v_item.household_id, p_batch_id, auth.uid(), 'discarded', v_item.name, 'Marcó el producto como tirado', -v_item.quantity);
end;
$$;

create view public.inventory_activity_feed
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

create view public.inventory_notification_candidates
with (security_invoker = false)
as
select
  b.id,
  b.household_id,
  b.name,
  b.quantity,
  b.unit,
  b.expiry_kind,
  case
    when b.expires_on is not null and b.opened_on is not null and b.consume_within_days_after_opening is not null
      then least(b.expires_on, b.opened_on + b.consume_within_days_after_opening)
    when b.expires_on is not null then b.expires_on
    when b.opened_on is not null and b.consume_within_days_after_opening is not null
      then b.opened_on + b.consume_within_days_after_opening
    else null
  end as effective_expires_on
from public.inventory_batches b
where b.status = 'active' and b.quantity > 0;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_events enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

create policy profiles_select_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_household_peers on public.profiles for select to authenticated using (public.shares_household_with(id));
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy households_select_members on public.households for select to authenticated using (public.is_household_member(id));
create policy households_update_owners on public.households for update to authenticated using (public.is_household_owner(id)) with check (public.is_household_owner(id));
create policy household_members_select_members on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy household_members_delete_owners on public.household_members for delete to authenticated using (public.is_household_owner(household_id) or user_id = auth.uid());
create policy household_invites_select_owners on public.household_invites for select to authenticated using (public.is_household_owner(household_id));
create policy inventory_select_members on public.inventory_batches for select to authenticated using (public.is_household_member(household_id));
create policy inventory_insert_members on public.inventory_batches for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy inventory_update_members on public.inventory_batches for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy inventory_events_select_members on public.inventory_events for select to authenticated using (public.is_household_member(household_id));
create policy inventory_events_insert_members on public.inventory_events for insert to authenticated with check (public.is_household_member(household_id) and user_id = auth.uid());
create policy notification_preferences_own on public.notification_preferences for all to authenticated using (user_id = auth.uid() and public.is_household_member(household_id)) with check (user_id = auth.uid() and public.is_household_member(household_id));
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_household_member(household_id));
create policy notification_log_select_own on public.notification_log for select to authenticated using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
grant select on public.household_invites to authenticated;
grant select, insert, update on public.inventory_batches to authenticated;
grant select, insert on public.inventory_events to authenticated;
grant all on public.notification_preferences to authenticated;
grant all on public.push_subscriptions to authenticated;
grant select on public.notification_log to authenticated;
grant select on public.inventory_activity_feed to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_household_invite(uuid) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.consume_inventory_item(uuid, numeric) to authenticated;
grant execute on function public.restore_consumed_inventory_event(uuid) to authenticated;
grant execute on function public.open_inventory_item(uuid) to authenticated;
grant execute on function public.discard_inventory_item(uuid) to authenticated;

revoke all on function public.create_household(text) from public;
revoke all on function public.create_household_invite(uuid) from public;
revoke all on function public.join_household(text) from public;
revoke all on function public.consume_inventory_item(uuid, numeric) from public;
revoke all on function public.restore_consumed_inventory_event(uuid) from public;
revoke all on function public.open_inventory_item(uuid) from public;
revoke all on function public.discard_inventory_item(uuid) from public;
revoke all on public.inventory_notification_candidates from anon, authenticated;
grant select on public.inventory_notification_candidates to service_role;

do $$
begin
  alter publication supabase_realtime add table public.inventory_batches;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.inventory_events;
exception when duplicate_object then null;
end $$;
