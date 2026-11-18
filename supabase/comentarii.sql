-- Comentarii la produsele din lista. Se ruleaza o data, dupa schema.sql.
-- Cheia publica poate citi, adauga si sterge comentarii (fara editare). Stergerea produsului le sterge si pe ele.

create table if not exists item_comments (
  id bigint generated always as identity primary key,
  item_id bigint not null references shopping_items(id) on delete cascade,
  author text not null check (char_length(btrim(author)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists item_comments_item_id on item_comments (item_id);

alter table item_comments enable row level security;

drop policy if exists "comentarii: citire" on item_comments;
drop policy if exists "comentarii: adaugare" on item_comments;
drop policy if exists "comentarii: stergere" on item_comments;
create policy "comentarii: citire" on item_comments for select to anon using (true);
create policy "comentarii: adaugare" on item_comments for insert to anon with check (true);
create policy "comentarii: stergere" on item_comments for delete to anon using (true);

grant select, insert, delete on item_comments to anon;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_comments') then
    alter publication supabase_realtime add table public.item_comments;
  end if;
end $$;
