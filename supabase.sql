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

-- Aggregations used by the API (service role only).
create function spending_by_month(p_user_id uuid, p_start date, p_end date)
returns table (month text, category_id uuid, income numeric, expenses numeric, transaction_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    to_char(t.occurred_at, 'YYYY-MM') as month,
    t.category_id,
    coalesce(sum(t.amount) filter (where t.amount > 0), 0) as income,
    coalesce(-sum(t.amount) filter (where t.amount < 0), 0) as expenses,
    count(*) as transaction_count
  from public.transactions t
  where t.user_id = p_user_id
    and t.occurred_at >= p_start
    and t.occurred_at < p_end
  group by 1, 2
$$;

create function top_merchants(p_user_id uuid, p_start date, p_end date, p_limit int default 8)
returns table (description text, spent numeric, transaction_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select btrim(t.description), -sum(t.amount), count(*)
  from public.transactions t
  where t.user_id = p_user_id
    and t.amount < 0
    and t.occurred_at >= p_start
    and t.occurred_at < p_end
  group by btrim(t.description)
  order by 2 desc
  limit p_limit
$$;

-- Supabase grants execute on new functions to API roles by default.
revoke execute on function spending_by_month(uuid, date, date) from public, anon, authenticated;
revoke execute on function top_merchants(uuid, date, date, int) from public, anon, authenticated;
grant execute on function spending_by_month(uuid, date, date) to service_role;
grant execute on function top_merchants(uuid, date, date, int) to service_role;

-- One row per "Try the demo" sandbox account, so the server can cap how many
-- exist and delete them once they expire. Deleting the auth user cascades to
-- this row and to all of the sandbox's data.

create table demo_sandboxes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index demo_sandboxes_created_at_idx on demo_sandboxes (created_at);

-- RLS with no policies: only the server's service role can read or write it.
alter table demo_sandboxes enable row level security;
revoke all on demo_sandboxes from anon, authenticated;
