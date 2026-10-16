-- Expenses grouped by merchant, for spotting recurring charges. The merchant
-- key is the description lowercased with digits and punctuation dropped, so
-- store numbers and reference codes ("#552", "877-8244858") don't split one
-- merchant into several.
-- The server decides what counts as recurring; this only gathers the series.

begin;

create function recurring_candidates(p_user_id uuid, p_since date)
returns table (merchant text, description text, category_id uuid, dates date[], amounts numeric[])
language sql
stable
security invoker
set search_path = ''
as $$
  select
    k.merchant,
    (array_agg(t.description order by t.occurred_at desc, t.created_at desc))[1],
    (array_agg(t.category_id order by t.occurred_at desc, t.created_at desc))[1],
    array_agg(t.occurred_at order by t.occurred_at),
    array_agg(-t.amount order by t.occurred_at)
  from public.transactions t
  cross join lateral (
    select btrim(regexp_replace(lower(t.description), '[^a-z]+', ' ', 'g')) as merchant
  ) k
  where t.user_id = p_user_id
    and t.amount < 0
    and t.occurred_at >= p_since
    and k.merchant <> ''
  group by k.merchant
  having count(*) >= 3
$$;

revoke execute on function recurring_candidates(uuid, date) from public, anon, authenticated;
grant execute on function recurring_candidates(uuid, date) to service_role;

commit;
