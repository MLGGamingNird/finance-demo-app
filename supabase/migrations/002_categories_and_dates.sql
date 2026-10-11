-- Adds per-user categories and switches transactions to a plain date.
-- Run once in the Supabase SQL editor. Safe on existing data: old text
-- categories are copied into the new table before the column is dropped.

begin;

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  -- Lets transactions reference (id, user_id) so a transaction can only
  -- point at a category owned by the same user.
  unique (id, user_id)
);

alter table categories enable row level security;

create policy "Users can manage their own categories"
  on categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Backfill: turn existing free-text categories into category rows.
insert into categories (user_id, name, kind)
select distinct on (user_id, category)
  user_id,
  left(category, 40),
  case when amount >= 0 then 'income' else 'expense' end
from transactions
where category is not null and btrim(category) <> ''
order by user_id, category, created_at
on conflict (user_id, name) do nothing;

alter table transactions add column category_id uuid;

update transactions t
set category_id = c.id
from categories c
where c.user_id = t.user_id and c.name = left(t.category, 40);

alter table transactions
  add constraint transactions_category_fk
  foreign key (category_id, user_id)
  references categories (id, user_id)
  on delete set null (category_id);

alter table transactions drop column category;

-- Transactions happen on a day, not at an instant; a date avoids
-- timezone shifts when the browser and server disagree.
alter table transactions
  alter column occurred_at drop default,
  alter column occurred_at type date using (occurred_at at time zone 'UTC')::date,
  alter column occurred_at set default current_date;

create index transactions_user_date_idx on transactions (user_id, occurred_at desc);

commit;
