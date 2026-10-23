-- Hamdam shared memories and special dates.
-- Run this once in Supabase SQL Editor after the base schema and RLS scripts.

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.special_dates (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  event_date date not null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists memories_conversation_created_idx
  on public.memories (conversation_id, created_at desc);
create index if not exists special_dates_conversation_date_idx
  on public.special_dates (conversation_id, event_date);

alter table public.memories enable row level security;
alter table public.special_dates enable row level security;

drop policy if exists "Chat participants can read memories" on public.memories;
create policy "Chat participants can read memories"
on public.memories for select to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)
));

drop policy if exists "Chat participants can create memories" on public.memories;
create policy "Chat participants can create memories"
on public.memories for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)
  )
);

drop policy if exists "Chat participants can delete memories" on public.memories;
create policy "Chat participants can delete memories"
on public.memories for delete to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)
));

drop policy if exists "Chat participants can read special dates" on public.special_dates;
create policy "Chat participants can read special dates"
on public.special_dates for select to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)
));

drop policy if exists "Chat participants can create special dates" on public.special_dates;
create policy "Chat participants can create special dates"
on public.special_dates for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)
  )
);

drop policy if exists "Chat participants can delete special dates" on public.special_dates;
create policy "Chat participants can delete special dates"
on public.special_dates for delete to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)
));

grant select, insert, delete on public.memories to authenticated;
grant select, insert, delete on public.special_dates to authenticated;
