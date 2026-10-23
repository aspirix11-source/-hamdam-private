-- Hamdam media messages and private storage. Safe to run repeatedly.
alter table public.messages add column if not exists message_type text not null default 'text' check (message_type in ('text','image','video'));
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_name text;
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hamdam-media', 'hamdam-media', false, 52428800, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public=false, file_size_limit=52428800,
allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];

drop policy if exists "Hamdam members can upload media" on storage.objects;
create policy "Hamdam members can upload media" on storage.objects for insert to authenticated
with check (
 bucket_id = 'hamdam-media'
 and (storage.foldername(name))[1] in (
  select c.id::text from public.conversations c where auth.uid() in (c.user_a,c.user_b)
 )
);
drop policy if exists "Hamdam members can read media" on storage.objects;
create policy "Hamdam members can read media" on storage.objects for select to authenticated
using (
 bucket_id = 'hamdam-media'
 and (storage.foldername(name))[1] in (
  select c.id::text from public.conversations c where auth.uid() in (c.user_a,c.user_b)
 )
);
drop policy if exists "Hamdam members can delete own media" on storage.objects;
create policy "Hamdam members can delete own media" on storage.objects for delete to authenticated
using (
 bucket_id = 'hamdam-media'
 and (storage.foldername(name))[1] in (
  select c.id::text from public.conversations c where auth.uid() in (c.user_a,c.user_b)
 )
);
grant select, insert on public.messages to authenticated;
