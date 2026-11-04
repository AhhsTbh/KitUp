-- KitUp LFG backend · Supabase PostgreSQL migration
-- Install in a NEW Supabase project using SQL Editor. Safe to re-run CREATE objects
-- only where IF NOT EXISTS is indicated; run once on a fresh project.
-- SECURITY: no service-role secret is ever placed in browser code.

create extension if not exists pgcrypto;

create table if not exists public.lfg_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 32),
  region text not null default 'NA' check (region in ('NA','EU','Asia','Oceania','Other')),
  platform text not null default 'Crossplay' check (platform in ('Crossplay','PlayStation','Xbox','PC')),
  updated_at timestamptz not null default now()
);

create table if not exists public.lfg_groups (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(btrim(title)) between 4 and 70),
  description text not null default '' check (char_length(description) <= 400),
  mode text not null check (mode in ('Multiplayer','Ranked','DMZ')),
  region text not null check (region in ('NA','EU','Asia','Oceania','Other')),
  platform text not null check (platform in ('Crossplay','PlayStation','Xbox','PC')),
  mic text not null check (mic in ('Required','Preferred','Optional')),
  playstyle text not null check (playstyle in ('Competitive','Casual','Tactical','Objective')),
  capacity int not null check (capacity between 2 and 6),
  member_count int not null default 1 check (member_count between 0 and capacity),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '12 hours')
);

create table if not exists public.lfg_members (
  group_id uuid not null references public.lfg_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('leader','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id,user_id)
);

create table if not exists public.lfg_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lfg_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  note text not null default '' check (char_length(note) <= 180),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (group_id,user_id)
);

create table if not exists public.lfg_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lfg_groups(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null default 'text' check (kind in ('text','activision_id')),
  body text not null check (char_length(btrim(body)) between 1 and 600),
  created_at timestamptz not null default now()
);

create table if not exists public.lfg_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.lfg_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  group_id uuid references public.lfg_groups(id) on delete set null,
  message_id uuid references public.lfg_messages(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 5 and 350),
  created_at timestamptz not null default now(),
  check (group_id is not null or message_id is not null or target_user_id is not null)
);

create index if not exists lfg_groups_open_idx on public.lfg_groups (status,expires_at,created_at desc);
create index if not exists lfg_groups_leader_idx on public.lfg_groups (leader_id,created_at desc);
create index if not exists lfg_members_user_idx on public.lfg_members (user_id,group_id);
create index if not exists lfg_requests_group_idx on public.lfg_join_requests (group_id,status,created_at desc);
create index if not exists lfg_requests_user_idx on public.lfg_join_requests (user_id,created_at desc);
create index if not exists lfg_messages_group_idx on public.lfg_messages (group_id,created_at desc);

-- SECURITY DEFINER helper functions bypass RLS internally to avoid recursion in
-- membership policies. These functions return only booleans, never private data.
create or replace function public.lfg_is_member(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lfg_members m where m.group_id=gid and m.user_id=auth.uid());
$$;
create or replace function public.lfg_is_leader(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lfg_groups g where g.id=gid and g.leader_id=auth.uid());
$$;
create or replace function public.lfg_has_block_between(other_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lfg_blocks b where
    (b.blocker_id=auth.uid() and b.blocked_id=other_id)
    or (b.blocked_id=auth.uid() and b.blocker_id=other_id));
$$;
revoke all on function public.lfg_is_member(uuid) from public;
revoke all on function public.lfg_is_leader(uuid) from public;
revoke all on function public.lfg_has_block_between(uuid) from public;
grant execute on function public.lfg_is_member(uuid),public.lfg_is_leader(uuid),public.lfg_has_block_between(uuid) to authenticated;

-- Validating business rules on the server prevents users from bypassing UI.
create or replace function public.lfg_before_group_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is distinct from new.leader_id then
    raise exception 'You can only create groups for yourself';
  end if;
  if not exists (select 1 from public.lfg_profiles p where p.id=new.leader_id) then
    raise exception 'Set up your player profile first';
  end if;
  if (select count(*) from public.lfg_groups g
      where g.leader_id=new.leader_id and g.status='open' and g.expires_at>now()) >= 3 then
    raise exception 'Close an existing group before opening another';
  end if;
  new.member_count:=1;
  new.status:='open';
  new.created_at:=now();
  new.expires_at:=now()+interval '12 hours';
  return new;
end; $$;
create or replace function public.lfg_after_group_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lfg_members(group_id,user_id,role)
  values (new.id,new.leader_id,'leader');
  return new;
end; $$;
drop trigger if exists lfg_group_validate on public.lfg_groups;
create trigger lfg_group_validate before insert on public.lfg_groups
for each row execute function public.lfg_before_group_insert();
drop trigger if exists lfg_group_membership on public.lfg_groups;
create trigger lfg_group_membership after insert on public.lfg_groups
for each row execute function public.lfg_after_group_insert();

create or replace function public.lfg_before_request_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g public.lfg_groups%rowtype;
begin
  if auth.uid() is distinct from new.user_id then
    raise exception 'Not your request';
  end if;
  select * into g from public.lfg_groups where id=new.group_id;
  if not found or g.status <> 'open' or g.expires_at <= now() or g.member_count >= g.capacity then
    raise exception 'Group is closed or full';
  end if;
  if new.user_id=g.leader_id or public.lfg_is_member(new.group_id) then
    raise exception 'You already belong to this group';
  end if;
  if public.lfg_has_block_between(g.leader_id) then
    raise exception 'You cannot request this group';
  end if;
  if (select count(*) from public.lfg_join_requests r
      where r.user_id=new.user_id and r.created_at>now()-interval '1 hour')>=15 then
    raise exception 'Too many recent requests';
  end if;
  new.status:='pending'; new.created_at:=now();
  return new;
end; $$;
drop trigger if exists lfg_request_validate on public.lfg_join_requests;
create trigger lfg_request_validate before insert on public.lfg_join_requests
for each row execute function public.lfg_before_request_insert();

create or replace function public.lfg_after_request_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g public.lfg_groups%rowtype;
begin
  if new.status = old.status then return new; end if;
  if old.status <> 'pending' then
    raise exception 'Request has already been handled';
  end if;
  if new.group_id <> old.group_id or new.user_id <> old.user_id then
    raise exception 'Cannot change request owner';
  end if;
  if new.status = 'accepted' then
    select * into g from public.lfg_groups where id=new.group_id for update;
    if not found or g.status<>'open' or g.expires_at<=now() or g.member_count>=g.capacity then
      raise exception 'Group is closed or full';
    end if;
    if exists (select 1 from public.lfg_blocks b where
       (b.blocker_id=g.leader_id and b.blocked_id=new.user_id)
       or (b.blocker_id=new.user_id and b.blocked_id=g.leader_id)) then
      raise exception 'This request cannot be approved';
    end if;
    insert into public.lfg_members(group_id,user_id,role) values(new.group_id,new.user_id,'member')
    on conflict do nothing;
    update public.lfg_groups set member_count=(select count(*) from public.lfg_members where group_id=new.group_id)
      where id=new.group_id;
  end if;
  return new;
end; $$;
drop trigger if exists lfg_request_accepted on public.lfg_join_requests;
create trigger lfg_request_accepted after update of status on public.lfg_join_requests
for each row execute function public.lfg_after_request_update();

create or replace function public.lfg_after_member_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role='leader' then
    if not exists (select 1 from public.lfg_groups where id=old.group_id) then return old; end if;
    raise exception 'Leader must close the group, not leave it';
  end if;
  update public.lfg_groups set member_count=(select count(*) from public.lfg_members where group_id=old.group_id)
  where id=old.group_id;
  return old;
end; $$;
drop trigger if exists lfg_member_departed on public.lfg_members;
create trigger lfg_member_departed after delete on public.lfg_members
for each row execute function public.lfg_after_member_delete();

create or replace function public.lfg_before_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is distinct from new.sender_id or not public.lfg_is_member(new.group_id) then
    raise exception 'You must belong to a group to send messages';
  end if;
  if not exists (select 1 from public.lfg_groups g where g.id=new.group_id and g.expires_at>now()) then
    raise exception 'This group has expired';
  end if;
  if exists (select 1 from public.lfg_messages m
       where m.sender_id=new.sender_id and m.group_id=new.group_id
       and m.created_at > now()-interval '1 second') then
    raise exception 'Please slow down';
  end if;
  new.created_at:=now();
  return new;
end; $$;
drop trigger if exists lfg_message_validate on public.lfg_messages;
create trigger lfg_message_validate before insert on public.lfg_messages
for each row execute function public.lfg_before_message_insert();

-- Lock all tables down; API exposure happens only through RLS policies.
alter table public.lfg_profiles enable row level security;
alter table public.lfg_groups enable row level security;
alter table public.lfg_members enable row level security;
alter table public.lfg_join_requests enable row level security;
alter table public.lfg_messages enable row level security;
alter table public.lfg_blocks enable row level security;
alter table public.lfg_reports enable row level security;

revoke all on public.lfg_profiles,public.lfg_groups,public.lfg_members,
  public.lfg_join_requests,public.lfg_messages,public.lfg_blocks,public.lfg_reports
  from anon, authenticated;

grant select,insert on public.lfg_profiles to authenticated;
grant update (display_name,region,platform,updated_at) on public.lfg_profiles to authenticated;
grant select,insert on public.lfg_groups to authenticated;
grant update (title,description,mode,region,platform,mic,playstyle,capacity,status) on public.lfg_groups to authenticated;
grant delete on public.lfg_groups to authenticated;
grant select,delete on public.lfg_members to authenticated;
grant select,insert on public.lfg_join_requests to authenticated;
grant update (status) on public.lfg_join_requests to authenticated;
grant select,insert on public.lfg_messages to authenticated;
grant select,insert,delete on public.lfg_blocks to authenticated;
grant insert,select on public.lfg_reports to authenticated;

create policy lfg_profiles_read on public.lfg_profiles for select to authenticated using (true);
create policy lfg_profiles_add on public.lfg_profiles for insert to authenticated with check (id=auth.uid());
create policy lfg_profiles_edit on public.lfg_profiles for update to authenticated
 using (id=auth.uid()) with check (id=auth.uid());

create policy lfg_groups_read on public.lfg_groups for select to authenticated
 using ((status='open' and expires_at>now() and not public.lfg_has_block_between(leader_id))
   or leader_id=auth.uid() or public.lfg_is_member(id));
create policy lfg_groups_add on public.lfg_groups for insert to authenticated with check (leader_id=auth.uid());
create policy lfg_groups_edit on public.lfg_groups for update to authenticated
 using (leader_id=auth.uid()) with check (leader_id=auth.uid());
create policy lfg_groups_delete on public.lfg_groups for delete to authenticated using (leader_id=auth.uid());

create policy lfg_members_read on public.lfg_members for select to authenticated
 using (public.lfg_is_member(group_id));
create policy lfg_members_delete on public.lfg_members for delete to authenticated
 using ((user_id=auth.uid() and role='member') or public.lfg_is_leader(group_id) and role='member');

create policy lfg_requests_read on public.lfg_join_requests for select to authenticated
 using (user_id=auth.uid() or public.lfg_is_leader(group_id));
create policy lfg_requests_add on public.lfg_join_requests for insert to authenticated
 with check (user_id=auth.uid() and status='pending');
create policy lfg_requests_decide on public.lfg_join_requests for update to authenticated
 using (public.lfg_is_leader(group_id) and status='pending')
 with check (public.lfg_is_leader(group_id) and status in ('accepted','declined'));

create policy lfg_messages_read on public.lfg_messages for select to authenticated
 using (public.lfg_is_member(group_id) and not public.lfg_has_block_between(sender_id));
create policy lfg_messages_add on public.lfg_messages for insert to authenticated
 with check (sender_id=auth.uid() and public.lfg_is_member(group_id));

create policy lfg_blocks_read on public.lfg_blocks for select to authenticated
 using (blocker_id=auth.uid());
create policy lfg_blocks_add on public.lfg_blocks for insert to authenticated
 with check (blocker_id=auth.uid());
create policy lfg_blocks_del on public.lfg_blocks for delete to authenticated
 using (blocker_id=auth.uid());

create policy lfg_reports_read on public.lfg_reports for select to authenticated
 using (reporter_id=auth.uid());
create policy lfg_reports_add on public.lfg_reports for insert to authenticated
 with check (reporter_id=auth.uid());

-- Realtime is best-effort enhancement. Message CRUD stays functional via polling.
do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
     and schemaname='public' and tablename='lfg_messages') then
   alter publication supabase_realtime add table public.lfg_messages;
 end if;
end $$;

-- ADMIN NOTE: Reports are stored, not automatically acted upon. Review them in
-- Supabase Table Editor; establish an actual moderation process before launch.
