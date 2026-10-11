-- Aggregations run in Postgres instead of summing rows in Node: exact
-- numeric math, and no truncation at the API's 1,000-row response limit.
--
-- Both take a user id, so they're callable only by the server's service
-- role. They're also security invoker, so RLS would still scope any other
-- caller to their own rows.

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
