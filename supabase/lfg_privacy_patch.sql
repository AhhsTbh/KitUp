-- Run this once ONLY if you already ran an earlier lfg_schema.sql. It hides Activision IDs
-- (shown as ********) until players share an approved squad. Fresh installs do not need it.
drop policy if exists lfg_profiles_read on public.lfg_profiles;
create policy lfg_profiles_read on public.lfg_profiles for select to authenticated using (id=auth.uid());

-- Other players' Activision IDs stay hidden (shown as ********) until you share an approved squad.
-- Everyone reads names through this view; the table itself only returns your own row.
create or replace view public.lfg_people with (security_barrier = true) as
select p.id, p.region, p.platform,
  case when p.id = auth.uid()
         or exists (select 1 from public.lfg_members a
                    join public.lfg_members b on b.group_id = a.group_id
                    where a.user_id = auth.uid() and b.user_id = p.id)
       then p.display_name else '********' end as display_name
from public.lfg_profiles p;
revoke all on public.lfg_people from anon, authenticated;
grant select on public.lfg_people to authenticated;
