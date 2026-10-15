-- Transactions from a CSV import carry a hash of their date, amount and
-- description, so importing the same file twice doesn't duplicate them.

begin;

alter table transactions add column import_hash text;

-- NULLs never conflict, so hand-entered transactions are unaffected.
alter table transactions
  add constraint transactions_user_import_hash_key unique (user_id, import_hash);

-- Which of these hashes the user already has, for the import preview. Takes
-- the list in the request body, which a filter in the URL couldn't fit.
create function existing_import_hashes(p_user_id uuid, p_hashes text[])
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select t.import_hash
  from public.transactions t
  where t.user_id = p_user_id
    and t.import_hash = any (p_hashes)
$$;

revoke execute on function existing_import_hashes(uuid, text[]) from public, anon, authenticated;
grant execute on function existing_import_hashes(uuid, text[]) to service_role;

commit;
