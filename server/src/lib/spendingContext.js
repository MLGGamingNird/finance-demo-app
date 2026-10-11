import { supabase } from './supabase.js';
import { listCategories } from './categories.js';
import { monthRange, shiftMonth } from './month.js';
import { formatUsd, fromCents, toCents } from './money.js';

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

  const [txResult, categories, budgetResult] = await Promise.all([
    supabase
      .from('transactions')
      .select('description, amount, category_id, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', start)
      .lt('occurred_at', end),
    listCategories(userId),
    supabase.from('budgets').select('category_id, amount').eq('user_id', userId),
  ]);
  if (txResult.error) throw txResult.error;
  if (budgetResult.error) throw budgetResult.error;

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const nameOf = (id) => categoryName.get(id) ?? 'Uncategorized';
  const budgets = new Map(budgetResult.data.map((b) => [b.category_id, toCents(b.amount)]));

  const monthly = new Map(months.map((m) => [m, { income: 0, spending: 0 }]));
  const byCategory = new Map(); // category_id -> { [month]: cents }
  const merchants = new Map(); // description -> { cents, count }
  const thisMonthExpenses = [];

  for (const t of txResult.data) {
    const month = t.occurred_at.slice(0, 7);
    const cents = toCents(t.amount);
    const totals = monthly.get(month);
    if (cents > 0) {
      totals.income += cents;
      continue;
    }
    const spent = -cents;
    totals.spending += spent;

    const key = t.category_id ?? null;
    const perMonth = byCategory.get(key) ?? {};
    perMonth[month] = (perMonth[month] ?? 0) + spent;
    byCategory.set(key, perMonth);

    const merchant = t.description.trim();
    const m = merchants.get(merchant) ?? { cents: 0, count: 0 };
    merchants.set(merchant, { cents: m.cents + spent, count: m.count + 1 });

    if (month === currentMonth) thisMonthExpenses.push({ ...t, spent });
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
  for (const [name, { cents, count }] of [...merchants].sort((a, b) => b[1].cents - a[1].cents).slice(0, 8)) {
    lines.push(`- ${name}: ${money(cents)} across ${count} transaction${count === 1 ? '' : 's'}`);
  }

  lines.push('', 'LARGEST EXPENSES THIS MONTH');
  const largest = thisMonthExpenses.sort((a, b) => b.spent - a.spent).slice(0, 5);
  if (largest.length === 0) lines.push('- none yet');
  for (const t of largest) {
    lines.push(`- ${t.occurred_at}: ${t.description} (${nameOf(t.category_id)}) ${money(t.spent)}`);
  }

  return lines.join('\n');
}
