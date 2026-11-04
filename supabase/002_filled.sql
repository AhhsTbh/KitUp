-- Lets everyone see how full a squad is without exposing who is in it. Run once after 001_lfg.sql.
alter table lfg_posts add column if not exists filled int not null default 1;

create or replace function respond_join(p uuid, u uuid, accept boolean) returns void language plpgsql security definer set search_path = public as $$
declare post lfg_posts; taken int;
begin
  select * into post from lfg_posts where id = p for update;
  if not found or post.host <> auth.uid() then raise exception 'not your squad'; end if;
  if not accept then delete from lfg_members where post_id = p and user_id = u; return; end if;
  select count(*) + 1 into taken from lfg_members where post_id = p and status = 'accepted';
  if taken >= post.slots then raise exception 'squad is full'; end if;
  update lfg_members set status = 'accepted' where post_id = p and user_id = u and status = 'pending';
  if not found then raise exception 'no pending request'; end if;
  update lfg_posts set filled = taken + 1, status = case when taken + 1 >= post.slots then 'full' else 'open' end, last_activity = now() where id = p;
end $$;

create or replace function leave_squad(p uuid) returns void language plpgsql security definer set search_path = public as $$
declare was text;
begin
  select status into was from lfg_members where post_id = p and user_id = auth.uid();
  delete from lfg_members where post_id = p and user_id = auth.uid();
  if was = 'accepted' then
    update lfg_posts set filled = greatest(1, filled - 1), status = case when status = 'full' then 'open' else status end, last_activity = now() where id = p;
  end if;
end $$;
grant execute on function respond_join(uuid,uuid,boolean), leave_squad(uuid) to authenticated;
