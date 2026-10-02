-- Simple scheduler: initial schema.
-- Run once in the Supabase dashboard (SQL Editor -> New query -> paste -> Run),
-- or with the Supabase CLI: `supabase db push`.
--
-- Every row belongs to one user (anonymous or signed in). Row Level Security makes sure a
-- user can only ever read or write their own rows.

-- ---------------------------------------------------------------------------
-- Items and recurring series. The full record lives in `data` (same shape as the
-- app's Item / Series types), so the app can evolve fields without migrations.
-- ---------------------------------------------------------------------------

create table if not exists public.items (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb,
  -- When the user made the change (device clock). Used for last-write-wins.
  updated_at  timestamptz not null,
  deleted     boolean not null default false,
  -- When the server received it. Devices pull "everything since my last synced_at".
  synced_at   timestamptz not null default now()
);

create table if not exists public.series (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb,
  updated_at  timestamptz not null,
  deleted     boolean not null default false,
  synced_at   timestamptz not null default now()
);

create index if not exists items_user_synced on public.items (user_id, synced_at);
create index if not exists series_user_synced on public.series (user_id, synced_at);

-- Server stamps synced_at on every write (clients can't backdate it), and an older
-- write can never overwrite a newer one.
create or replace function public.stamp_synced_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- stale write: keep the newer row
  end if;
  new.synced_at := clock_timestamp();
  new.user_id := coalesce(old.user_id, new.user_id);
  return new;
end $$;

drop trigger if exists items_stamp on public.items;
create trigger items_stamp before insert or update on public.items
  for each row execute function public.stamp_synced_at();
drop trigger if exists series_stamp on public.series;
create trigger series_stamp before insert or update on public.series
  for each row execute function public.stamp_synced_at();

alter table public.items enable row level security;
alter table public.series enable row level security;

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own series" on public.series;
create policy "own series" on public.series
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Plan + AI allowance. Clients can read their own row; only the server (service role,
-- e.g. the AI fallback function or a billing webhook) can change it.
-- ---------------------------------------------------------------------------

create table if not exists public.entitlements (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  pro_until    timestamptz,
  ai_period    text not null default to_char(now(), 'YYYY-MM'),
  ai_count     integer not null default 0
);

alter table public.entitlements enable row level security;

drop policy if exists "read own entitlement" on public.entitlements;
create policy "read own entitlement" on public.entitlements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Give every new user (anonymous or not) an entitlement row on the Free plan.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.entitlements (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- To give a tester Pro for a month (run in SQL Editor):
--   update public.entitlements set pro_until = now() + interval '30 days'
--   where user_id = (select id from auth.users where email = 'tester@example.com');
