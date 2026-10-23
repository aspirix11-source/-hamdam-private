-- Run in Supabase SQL Editor after the initial tables have been created.
-- Protects profile visibility, conversation membership, and message access.

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Members can view own profile" on public.profiles;
create policy "Members can view own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

drop policy if exists "Members can update own profile" on public.profiles;
create policy "Members can update own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Inviter can view own invitations" on public.invitations;
create policy "Inviter can view own invitations"
on public.invitations for select to authenticated
using (invited_by = (select auth.uid()));

drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations"
on public.conversations for select to authenticated
using ((select auth.uid()) = user_a or (select auth.uid()) = user_b);

drop policy if exists "Participants can create conversations" on public.conversations;
create policy "Participants can create conversations"
on public.conversations for insert to authenticated
with check (
  (select auth.uid()) = user_a
  or (select auth.uid()) = user_b
);

drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages"
on public.messages for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (select auth.uid()) in (c.user_a, c.user_b)
  )
);

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (select auth.uid()) in (c.user_a, c.user_b)
  )
);

grant select, update on public.profiles to authenticated;
grant select on public.invitations to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

-- Enable realtime message updates (safe to run repeatedly).
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when others then
  if sqlstate <> '42710' then raise; end if;
end $$;
