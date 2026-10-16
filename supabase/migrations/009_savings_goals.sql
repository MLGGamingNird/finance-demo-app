-- Savings goals: something to save toward, how much is put aside so far,
-- and an optional date to reach it by.

begin;

create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  target_amount numeric(12, 2) not null check (target_amount > 0),
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
  target_date date,
  created_at timestamptz not null default now()
);

create index savings_goals_user_idx on savings_goals (user_id, created_at);

alter table savings_goals enable row level security;

create policy "Users can manage their own savings goals"
  on savings_goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
