import { supabase } from './supabase.js';

// Per-month, per-category income and spending, aggregated in Postgres.
// [start, end) are YYYY-MM-DD dates.
export async function spendingByMonth(userId, start, end) {
  const { data, error } = await supabase.rpc('spending_by_month', {
    p_user_id: userId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data;
}

export async function topMerchants(userId, start, end, limit = 8) {
  const { data, error } = await supabase.rpc('top_merchants', {
    p_user_id: userId,
    p_start: start,
    p_end: end,
    p_limit: limit,
  });
  if (error) throw error;
  return data;
}

// Expense series grouped by merchant since `since`, for recurring detection.
export async function recurringCandidates(userId, since) {
  const { data, error } = await supabase.rpc('recurring_candidates', { p_user_id: userId, p_since: since });
  if (error) throw error;
  return data;
}
