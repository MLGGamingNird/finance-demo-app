import { supabase } from './supabase.js';
import { listCategories } from './categories.js';
import { monthRange, shiftMonth } from './month.js';
import { formatUsd, fromCents, toCents } from './money.js';
import { spendingByMonth, topMerchants } from './spending.js';

const MONTHS = 6;

const monthName = (month) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Builds a plain-text digest of the user's finances for the chat model.
// Every number is computed here; the model only has to read and explain
// them, never do arithmetic or see raw rows.
export async function buildSpendingContext(userId, today = new Date()) {
  const currentMonth = today.toISOString().slice(0, 7);
  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(currentMonth, i - MONTHS + 1));
  const lastMonth = months.at(-2);
  const [start] = monthRange(months[0]);
  const [, end] = monthRange(currentMonth);

  const [currentStart] = monthRange(currentMonth);
  const [rows, merchants, largestResult, categories, budgetResult] = await Promise.all([
    spendingByMonth(userId, start, end),
    topMerchants(userId, start, end, 8),
    // Most negative amounts first = largest expenses.
    supabase
      .from('transactions')
      .select('description, amount, category_id, occurred_at')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('occurred_at', currentStart)
      .lt('occurred_at', end)
      .order('amount', { ascending: true })
      .limit(5),
    listCategories(userId),
    supabase.from('budgets').select('category_id, amount').eq('user_id', userId),
  ]);
  if (largestResult.error) throw largestResult.error;
  if (budgetResult.error) throw budgetResult.error;

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const nameOf = (id) => categoryName.get(id) ?? 'Uncategorized';
  const budgets = new Map(budgetResult.data.map((b) => [b.category_id, toCents(b.amount)]));

  const monthly = new Map(months.map((m) => [m, { income: 0, spending: 0 }]));
  const byCategory = new Map(); // category_id -> { [month]: cents }

  for (const row of rows) {
    const totals = monthly.get(row.month);
    totals.income += toCents(row.income);
    const spent = toCents(row.expenses);
    totals.spending += spent;
    if (spent > 0) {
      const perMonth = byCategory.get(row.category_id) ?? {};
      perMonth[row.month] = (perMonth[row.month] ?? 0) + spent;
      byCategory.set(row.category_id, perMonth);
    }
  }

  const money = (cents) => formatUsd(fromCents(cents));
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const completeMonths = months.slice(0, -1).filter((m) => monthly.get(m).income || monthly.get(m).spending);
  const avgSpending = completeMonths.length
    ? Math.round(completeMonths.reduce((sum, m) => sum + monthly.get(m).spending, 0) / completeMonths.length)
    : null;

  const lines = [];
  lines.push(
    `Today is ${today.toISOString().slice(0, 10)}, day ${today.getUTCDate()} of ${daysInMonth} in ${monthName(currentMonth)}.`,
    'Amounts are in USD. "This month" means month to date.',
    '',
    'MONTHLY TOTALS',
  );
  for (const m of months) {
    const { income, spending } = monthly.get(m);
    const note = m === currentMonth ? ' (month to date)' : '';
    lines.push(`- ${monthName(m)}${note}: income ${money(income)}, spending ${money(spending)}, net ${money(income - spending)}`);
  }
  if (avgSpending !== null) {
    lines.push(`Average monthly spending over the ${completeMonths.length} previous complete months: ${money(avgSpending)}`);
  }

  lines.push('', `SPENDING BY CATEGORY (this month / last month / monthly budget)`);
  const categoryRows = [...byCategory]
    .map(([id, perMonth]) => ({ id, now: perMonth[currentMonth] ?? 0, last: perMonth[lastMonth] ?? 0 }))
    .sort((a, b) => b.now - a.now || b.last - a.last);
  for (const { id, now, last } of categoryRows) {
    const budget = budgets.get(id);
    const budgetText = budget
      ? `budget ${money(budget)} (${Math.round((now / budget) * 100)}% used${now > budget ? `, over by ${money(now - budget)}` : ''})`
      : 'no budget';
    lines.push(`- ${nameOf(id)}: ${money(now)} / ${money(last)} / ${budgetText}`);
  }
  for (const [id, budget] of budgets) {
    if (!byCategory.has(id)) lines.push(`- ${nameOf(id)}: ${money(0)} / ${money(0)} / budget ${money(budget)} (0% used)`);
  }

  lines.push('', `TOP MERCHANTS BY SPENDING (last ${MONTHS} months)`);
  for (const { description, spent, transaction_count: count } of merchants) {
    lines.push(`- ${description}: ${money(toCents(spent))} across ${count} transaction${count === 1 ? '' : 's'}`);
  }

  lines.push('', 'LARGEST EXPENSES THIS MONTH');
  if (largestResult.data.length === 0) lines.push('- none yet');
  for (const t of largestResult.data) {
    lines.push(`- ${t.occurred_at}: ${t.description} (${nameOf(t.category_id)}) ${money(-toCents(t.amount))}`);
  }

  return lines.join('\n');
}
