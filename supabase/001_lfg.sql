-- Kit Up web LFG: tables, row-level security, and atomic join/accept functions.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  platform text check (platform in ('pc','ps','xbox')),
  region text, language text, mic boolean default true, playstyle text,
  created_at timestamptz default now());

create table if not exists lfg_posts (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references profiles on delete cascade,
  mode text not null check (mode in ('multiplayer','dmz','warzone')),
  slots int not null check (slots between 2 and 6),
  note text check (char_length(note) <= 100),
  region text, language text, mic boolean default true,
  status text not null default 'open' check (status in ('open','full','closed')),
  created_at timestamptz default now(), last_activity timestamptz default now());
create index if not exists lfg_posts_open on lfg_posts (status, created_at desc);

create table if not exists lfg_members (
  post_id uuid references lfg_posts on delete cascade,
  user_id uuid references profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  primary key (post_id, user_id));

create table if not exists messages (
  id bigint generated always as identity primary key,
  post_id uuid not null references lfg_posts on delete cascade,
  sender uuid not null references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz default now());
create index if not exists messages_post on messages (post_id, created_at);

create table if not exists blocks (
  blocker uuid references profiles on delete cascade, blocked uuid references profiles on delete cascade,
  primary key (blocker, blocked), check (blocker <> blocked));

create table if not exists reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references profiles on delete cascade,
  post_id uuid references lfg_posts on delete set null, target uuid references profiles on delete set null,
  reason text not null check (char_length(reason) between 3 and 500), created_at timestamptz default now());

-- Helpers (security definer so policies never recurse)
create or replace function is_party(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from lfg_posts where id = p and host = auth.uid())
      or exists (select 1 from lfg_members where post_id = p and user_id = auth.uid() and status = 'accepted') $$;
create or replace function is_blocked(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a)) $$;

-- Row-level security
alter table profiles enable row level security; alter table lfg_posts enable row level security;
alter table lfg_members enable row level security; alter table messages enable row level security;
alter table blocks enable row level security; alter table reports enable row level security;

drop policy if exists p_sel on profiles; create policy p_sel on profiles for select to authenticated using (not is_blocked(auth.uid(), id));
drop policy if exists p_ins on profiles; create policy p_ins on profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists p_upd on profiles; create policy p_upd on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists p_del on profiles; create policy p_del on profiles for delete to authenticated using (id = auth.uid());

drop policy if exists lp_sel on lfg_posts; create policy lp_sel on lfg_posts for select to authenticated
  using ((status in ('open','full') and not is_blocked(auth.uid(), host)) or host = auth.uid() or is_party(id));
drop policy if exists lp_ins on lfg_posts; create policy lp_ins on lfg_posts for insert to authenticated with check (host = auth.uid() and status = 'open');
drop policy if exists lp_upd on lfg_posts; create policy lp_upd on lfg_posts for update to authenticated using (host = auth.uid()) with check (host = auth.uid());
drop policy if exists lp_del on lfg_posts; create policy lp_del on lfg_posts for delete to authenticated using (host = auth.uid());

-- Members can only be written through the functions below.
drop policy if exists lm_sel on lfg_members; create policy lm_sel on lfg_members for select to authenticated using (user_id = auth.uid() or is_party(post_id));
drop policy if exists m_sel on messages; create policy m_sel on messages for select to authenticated using (is_party(post_id));
drop policy if exists m_ins on messages; create policy m_ins on messages for insert to authenticated with check (sender = auth.uid() and is_party(post_id));
drop policy if exists b_all on blocks; create policy b_all on blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());
drop policy if exists r_ins on reports; create policy r_ins on reports for insert to authenticated with check (reporter = auth.uid());

-- Spam guard: max 5 messages per 10 seconds per user
create or replace function limit_messages() returns trigger language plpgsql as $$
begin
  if (select count(*) from messages where sender = new.sender and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'slow down';
  end if; return new;
end $$;
drop trigger if exists trg_limit_messages on messages;
create trigger trg_limit_messages before insert on messages for each row execute function limit_messages();

-- Atomic join flow: the post row is locked so two people can never take the last slot.
create or replace function request_join(p uuid) returns void language plpgsql security definer set search_path = public as $$
declare post lfg_posts;
begin
  select * into post from lfg_posts where id = p for update;
  if not found or post.status <> 'open' then raise exception 'squad not open'; end if;
  if post.host = auth.uid() then raise exception 'you host this squad'; end if;
  if is_blocked(auth.uid(), post.host) then raise exception 'unavailable'; end if;
  insert into lfg_members (post_id, user_id) values (p, auth.uid()) on conflict do nothing;
  update lfg_posts set last_activity = now() where id = p;
end $$;

create or replace function respond_join(p uuid, u uuid, accept boolean) returns void language plpgsql security definer set search_path = public as $$
declare post lfg_posts; taken int;
begin
  select * into post from lfg_posts where id = p for update;
  if not found or post.host <> auth.uid() then raise exception 'not your squad'; end if;
  if not accept then delete from lfg_members where post_id = p and user_id = u; return; end if;
  select count(*) + 1 into taken from lfg_members where post_id = p and status = 'accepted';
  if taken >= post.slots then raise exception 'squad is full'; end if;
  update lfg_members set status = 'accepted' where post_id = p and user_id = u;
  if taken + 1 >= post.slots then update lfg_posts set status = 'full' where id = p; end if;
  update lfg_posts set last_activity = now() where id = p;
end $$;

create or replace function leave_squad(p uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from lfg_members where post_id = p and user_id = auth.uid();
  update lfg_posts set status = 'open', last_activity = now() where id = p and status = 'full';
end $$;

-- Close squads nobody has touched for an hour (call from a Supabase scheduled job; see README note).
create or replace function expire_stale_squads() returns int language sql security definer set search_path = public as $$
  with c as (update lfg_posts set status = 'closed' where status in ('open','full') and last_activity < now() - interval '60 minutes' returning 1)
  select count(*)::int from c $$;
revoke all on function expire_stale_squads() from public, anon, authenticated;
grant execute on function request_join(uuid), respond_join(uuid,uuid,boolean), leave_squad(uuid) to authenticated;

-- Live updates for the app
alter publication supabase_realtime add table lfg_posts, lfg_members, messages;
