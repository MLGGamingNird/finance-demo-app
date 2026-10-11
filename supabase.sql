-- Full schema for a fresh project. Run this in the Supabase SQL editor.
-- Existing projects: apply the files in supabase/migrations/ instead.

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

alter table categories enable row level security;

create policy "Users can manage their own categories"
  on categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  amount numeric not null,
  category_id uuid,
  auto_categorized boolean not null default false,
  occurred_at date not null default current_date,
  created_at timestamptz not null default now(),
  -- A transaction can only reference a category owned by the same user.
  constraint transactions_category_fk
    foreign key (category_id, user_id)
    references categories (id, user_id)
    on delete set null (category_id)
);

create index transactions_user_date_idx on transactions (user_id, occurred_at desc);

alter table transactions enable row level security;

create policy "Users can manage their own transactions"
  on transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id),
  constraint budgets_category_fk
    foreign key (category_id, user_id)
    references categories (id, user_id)
    on delete cascade
);

alter table budgets enable row level security;

create policy "Users can manage their own budgets"
  on budgets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
