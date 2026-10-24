-- Hamdam owner approval gate.
-- Run once in Supabase SQL Editor after the existing Hamdam SQL setup.
-- Pending invitees cannot create their own conversation to bypass approval.

drop policy if exists "Participants can create conversations" on public.conversations;
revoke insert on public.conversations from authenticated;

create or replace function public.handle_hamdam_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation record;
  left_user uuid;
  right_user uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Hamdam member')
  )
  on conflict (id) do nothing;

  select i.invited_by, i.id
    into invitation
    from public.invitations i
   where lower(i.email) = lower(coalesce(new.email, ''))
     and i.expires_at > now()
     and i.accepted_at is not null
   order by i.created_at desc
   limit 1;

  -- Only an owner-approved invitation creates the private conversation.
  if invitation.invited_by is not null and invitation.invited_by <> new.id then
    left_user := least(invitation.invited_by, new.id);
    right_user := greatest(invitation.invited_by, new.id);

    insert into public.conversations (user_a, user_b)
    values (left_user, right_user)
    on conflict (user_a, user_b) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_hamdam_auth_user_created on auth.users;
create trigger on_hamdam_auth_user_created
after insert on auth.users
for each row execute function public.handle_hamdam_new_user();
