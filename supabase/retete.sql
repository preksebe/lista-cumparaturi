-- Retete pentru lista de cumparaturi. Se ruleaza o data, dupa schema.sql si poze.sql.
-- O reteta e salvata mereu pentru O PORTIE. Marimea pachetului se tine global, pe ingredient (dupa nume).
-- Cheia publica poate citi si modifica retetele pe loc (fara creare din site) si poate seta marimile de pachete.
-- Retetele noi se introduc prin API-ul de management (rol postgres), vezi exemplul de la final.

-- Pe lista: totalul in grame venit dintr-o reteta (gol pentru produsele adaugate de mana).
alter table shopping_items add column if not exists grams numeric(12, 2)
  check (grams is null or (grams > 0 and grams <= 10000000));

create table if not exists recipes (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  added_by text not null check (char_length(btrim(added_by)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references recipes(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  grams_per_portion numeric(10, 2) not null check (grams_per_portion > 0 and grams_per_portion <= 100000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists recipe_ingredients_recipe_id on recipe_ingredients (recipe_id);

-- Cheia e numele ingredientului cu litere mici si fara spatii la capete: "Broccoli congelat" -> "broccoli congelat".
create table if not exists package_sizes (
  name_key text primary key check (name_key = lower(btrim(name_key)) and char_length(name_key) between 1 and 80),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  grams numeric(10, 2) not null check (grams > 0 and grams <= 100000),
  updated_at timestamptz not null default now()
);

-- updated_at se pune singur la modificare (aceeasi functie ca la shopping_items).
drop trigger if exists recipes_touch on recipes;
create trigger recipes_touch before update on recipes for each row execute function shopping_items_touch();
drop trigger if exists package_sizes_touch on package_sizes;
create trigger package_sizes_touch before update on package_sizes for each row execute function shopping_items_touch();

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table package_sizes enable row level security;

drop policy if exists "retete: citire" on recipes;
drop policy if exists "retete: modificare" on recipes;
drop policy if exists "retete: stergere" on recipes;
create policy "retete: citire" on recipes for select to anon using (true);
create policy "retete: modificare" on recipes for update to anon using (true) with check (true);
create policy "retete: stergere" on recipes for delete to anon using (true);

drop policy if exists "ingrediente: citire" on recipe_ingredients;
drop policy if exists "ingrediente: modificare" on recipe_ingredients;
drop policy if exists "ingrediente: stergere" on recipe_ingredients;
create policy "ingrediente: citire" on recipe_ingredients for select to anon using (true);
create policy "ingrediente: modificare" on recipe_ingredients for update to anon using (true) with check (true);
create policy "ingrediente: stergere" on recipe_ingredients for delete to anon using (true);

drop policy if exists "pachete: citire" on package_sizes;
drop policy if exists "pachete: adaugare" on package_sizes;
drop policy if exists "pachete: modificare" on package_sizes;
drop policy if exists "pachete: stergere" on package_sizes;
create policy "pachete: citire" on package_sizes for select to anon using (true);
create policy "pachete: adaugare" on package_sizes for insert to anon with check (true);
create policy "pachete: modificare" on package_sizes for update to anon using (true) with check (true);
create policy "pachete: stergere" on package_sizes for delete to anon using (true);

grant select, update, delete on recipes to anon;
grant select, update, delete on recipe_ingredients to anon;
grant select, insert, update, delete on package_sizes to anon;

-- Sincronizare in timp real.
do $$
declare t text;
begin
  foreach t in array array['recipes', 'recipe_ingredients', 'package_sizes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- EXEMPLU de introducere a unei retete (o portie), cu 3 ingrediente si o marime de pachet:
--
-- with r as (
--   insert into recipes (name, added_by) values ('Paste cu broccoli', 'Vladut') returning id
-- )
-- insert into recipe_ingredients (recipe_id, name, grams_per_portion, position)
-- select r.id, i.name, i.grams, i.pos
-- from r, (values ('Paste penne', 100, 1), ('Broccoli congelat', 150, 2), ('Parmezan', 20, 3)) as i(name, grams, pos);
--
-- insert into package_sizes (name_key, name, grams) values ('broccoli congelat', 'Broccoli congelat', 500)
-- on conflict (name_key) do update set name = excluded.name, grams = excluded.grams;
