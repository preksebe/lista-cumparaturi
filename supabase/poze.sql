-- Poze la produse: bucket dedicat listei in Supabase Storage + coloana cu calea pozei.
-- Cheia publica poate lucra DOAR in bucket-ul "lista-poze", la fel ca la tabel.

alter table shopping_items add column if not exists photo_path text
  check (photo_path is null or char_length(photo_path) between 1 and 200);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lista-poze', 'lista-poze', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lista-poze: citire" on storage.objects;
drop policy if exists "lista-poze: incarcare" on storage.objects;
drop policy if exists "lista-poze: modificare" on storage.objects;
drop policy if exists "lista-poze: stergere" on storage.objects;
create policy "lista-poze: citire" on storage.objects for select to anon using (bucket_id = 'lista-poze');
create policy "lista-poze: incarcare" on storage.objects for insert to anon with check (bucket_id = 'lista-poze');
create policy "lista-poze: modificare" on storage.objects for update to anon using (bucket_id = 'lista-poze') with check (bucket_id = 'lista-poze');
create policy "lista-poze: stergere" on storage.objects for delete to anon using (bucket_id = 'lista-poze');
