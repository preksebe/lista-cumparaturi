-- Lista de cumparaturi: un singur tabel, in proiectul Supabase NBAI.
-- Fara cont: cheia publica (anon/publishable) poate citi, adauga, modifica si sterge DOAR in tabelul asta.

create table if not exists shopping_items (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  qty integer not null default 1 check (qty between 1 and 999),
  added_by text not null check (char_length(btrim(added_by)) between 1 and 40),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function shopping_items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists shopping_items_touch on shopping_items;
create trigger shopping_items_touch before update on shopping_items
  for each row execute function shopping_items_touch();

alter table shopping_items enable row level security;

drop policy if exists "lista: citire" on shopping_items;
drop policy if exists "lista: adaugare" on shopping_items;
drop policy if exists "lista: modificare" on shopping_items;
drop policy if exists "lista: stergere" on shopping_items;
create policy "lista: citire" on shopping_items for select to anon using (true);
create policy "lista: adaugare" on shopping_items for insert to anon with check (true);
create policy "lista: modificare" on shopping_items for update to anon using (true) with check (true);
create policy "lista: stergere" on shopping_items for delete to anon using (true);

grant select, insert, update, delete on shopping_items to anon;

-- Sincronizare in timp real intre telefoane.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items'
  ) then
    alter publication supabase_realtime add table shopping_items;
  end if;
end $$;
