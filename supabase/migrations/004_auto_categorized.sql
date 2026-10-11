-- Marks transactions whose category was picked automatically (from the
-- user's history or the AI) rather than chosen by the user.

alter table transactions
  add column auto_categorized boolean not null default false;
