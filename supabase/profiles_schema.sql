-- Kit Up player profiles · Supabase migration (additive: it only creates new objects and never touches the lfg_* tables)
-- Run once in the Supabase SQL Editor of the same project the Squad finder uses. Safe to re-run: every create is guarded.
-- SECURITY: row-level security is on for every table; anonymous visitors can only READ public profiles and their shared loadouts.
-- No service-role key is used anywhere in the browser.

create table if not exists public.ku_profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar text not null default '' check (char_length(avatar) <= 60),
  favorites text[] not null default '{}' check (cardinality(favorites) <= 12),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ku_profiles_username_key on public.ku_profiles (lower(username));

create table if not exists public.ku_shared_loadouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.ku_profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 40),
  code text not null check (char_length(code) <= 2000 and code ~ '^l-[A-Za-z0-9_-]+$'),
  created_at timestamptz not null default now()
);
create index if not exists ku_shared_loadouts_owner_idx on public.ku_shared_loadouts (owner_id, created_at desc);

create table if not exists public.ku_follows (
  follower_id uuid not null default auth.uid() references public.ku_profiles(id) on delete cascade,
  followee_id uuid not null references public.ku_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists ku_follows_followee_idx on public.ku_follows (followee_id);

-- spam protection: a player can share at most 30 loadouts and follow at most 200 players
create or replace function public.ku_limit_shared() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.ku_shared_loadouts where owner_id = new.owner_id) >= 30 then
    raise exception 'You can share up to 30 loadouts. Delete one first.';
  end if;
  return new;
end $$;
create or replace function public.ku_limit_follows() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.ku_follows where follower_id = new.follower_id) >= 200 then
    raise exception 'You can follow up to 200 players.';
  end if;
  return new;
end $$;
create or replace function public.ku_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists ku_limit_shared_t on public.ku_shared_loadouts;
create trigger ku_limit_shared_t before insert on public.ku_shared_loadouts for each row execute function public.ku_limit_shared();
drop trigger if exists ku_limit_follows_t on public.ku_follows;
create trigger ku_limit_follows_t before insert on public.ku_follows for each row execute function public.ku_limit_follows();
drop trigger if exists ku_touch_t on public.ku_profiles;
create trigger ku_touch_t before update on public.ku_profiles for each row execute function public.ku_touch();
revoke all on function public.ku_limit_shared(), public.ku_limit_follows() from public;

alter table public.ku_profiles enable row level security;
alter table public.ku_shared_loadouts enable row level security;
alter table public.ku_follows enable row level security;

revoke all on public.ku_profiles, public.ku_shared_loadouts, public.ku_follows from anon, authenticated;
grant select on public.ku_profiles, public.ku_shared_loadouts to anon, authenticated;
grant select on public.ku_follows to authenticated;
grant insert on public.ku_profiles to authenticated;
grant update (username, bio, avatar, favorites, is_public) on public.ku_profiles to authenticated;
grant delete on public.ku_profiles to authenticated;
grant insert, delete on public.ku_shared_loadouts to authenticated;
grant insert, delete on public.ku_follows to authenticated;

drop policy if exists ku_profiles_read on public.ku_profiles;
create policy ku_profiles_read on public.ku_profiles for select to anon, authenticated using (is_public or id = auth.uid());
drop policy if exists ku_profiles_add on public.ku_profiles;
create policy ku_profiles_add on public.ku_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists ku_profiles_edit on public.ku_profiles;
create policy ku_profiles_edit on public.ku_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists ku_profiles_delete on public.ku_profiles;
create policy ku_profiles_delete on public.ku_profiles for delete to authenticated using (id = auth.uid());

drop policy if exists ku_shared_read on public.ku_shared_loadouts;
create policy ku_shared_read on public.ku_shared_loadouts for select to anon, authenticated
  using (owner_id = auth.uid() or exists (select 1 from public.ku_profiles p where p.id = owner_id and p.is_public));
drop policy if exists ku_shared_add on public.ku_shared_loadouts;
create policy ku_shared_add on public.ku_shared_loadouts for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists ku_shared_delete on public.ku_shared_loadouts;
create policy ku_shared_delete on public.ku_shared_loadouts for delete to authenticated using (owner_id = auth.uid());

drop policy if exists ku_follows_read on public.ku_follows;
create policy ku_follows_read on public.ku_follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid() or exists (select 1 from public.ku_profiles p where p.id = followee_id and p.is_public));
drop policy if exists ku_follows_add on public.ku_follows;
create policy ku_follows_add on public.ku_follows for insert to authenticated
  with check (follower_id = auth.uid() and exists (select 1 from public.ku_profiles p where p.id = followee_id and p.is_public));
drop policy if exists ku_follows_delete on public.ku_follows;
create policy ku_follows_delete on public.ku_follows for delete to authenticated using (follower_id = auth.uid());

-- hardening: trigger helpers must not be callable through the REST API
alter function public.ku_touch() set search_path = public;
revoke execute on function public.ku_limit_shared(), public.ku_limit_follows(), public.ku_touch() from public, anon, authenticated;
