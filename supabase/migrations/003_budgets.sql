-- Monthly spending limits, one per expense category.

begin;

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id),
  -- Same ownership guarantee as transactions; a budget goes away with its category.
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

commit;
