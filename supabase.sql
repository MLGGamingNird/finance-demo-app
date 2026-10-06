-- Run this in the Supabase SQL editor for your project.

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  amount numeric not null,
  category text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table transactions enable row level security;

create policy "Users can manage their own transactions"
  on transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
