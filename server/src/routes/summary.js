import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/requireAuth.js';
import { monthRange, monthSchema, shiftMonth } from '../lib/month.js';
import { fromCents, toCents } from '../lib/money.js';
import { recurringCandidates, spendingByMonth } from '../lib/spending.js';
import { RECURRING_LOOKBACK_DAYS, detectRecurring } from '../lib/recurring.js';

export const summaryRouter = Router();

summaryRouter.use(requireAuth);

const querySchema = z.object({ month: monthSchema });

function invalidQuery(res, error) {
  return res.status(400).json({ error: 'Invalid query', fields: z.flattenError(error).fieldErrors });
}

// Totals for one month. Postgres does the summing; cents here only keep
// the combined totals and net exact.
summaryRouter.get('/', async (req, res) => {
  const query = querySchema.safeParse(req.query);
  if (!query.success) return invalidQuery(res, query.error);

  try {
    const rows = await spendingByMonth(req.user.id, ...monthRange(query.data.month));

    let incomeCents = 0;
    let expenseCents = 0;
    for (const row of rows) {
      incomeCents += toCents(row.income);
      expenseCents += toCents(row.expenses);
    }

    res.json({
      month: query.data.month,
      income: fromCents(incomeCents),
      expenses: fromCents(expenseCents),
      net: fromCents(incomeCents - expenseCents),
      spending_by_category: rows
        .filter((row) => Number(row.expenses) > 0)
        .map((row) => ({ category_id: row.category_id, spent: Number(row.expenses) }))
        .sort((a, b) => b.spent - a.spent),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const trendQuerySchema = z.object({
  end: monthSchema,
  months: z.coerce.number().int().min(1).max(24).default(6),
});

// Income and spending per month for the `months` months ending at `end`.
// Months with no activity are included as zeros so the chart has no gaps.
summaryRouter.get('/trend', async (req, res) => {
  const query = trendQuerySchema.safeParse(req.query);
  if (!query.success) return invalidQuery(res, query.error);

  const { end, months } = query.data;
  const monthList = Array.from({ length: months }, (_, i) => shiftMonth(end, i - months + 1));
  const [start] = monthRange(monthList[0]);
  const [, endExclusive] = monthRange(end);

  try {
    const rows = await spendingByMonth(req.user.id, start, endExclusive);

    const totals = new Map(monthList.map((m) => [m, { incomeCents: 0, expenseCents: 0 }]));
    for (const row of rows) {
      const bucket = totals.get(row.month);
      bucket.incomeCents += toCents(row.income);
      bucket.expenseCents += toCents(row.expenses);
    }

    res.json(
      monthList.map((month) => {
        const { incomeCents, expenseCents } = totals.get(month);
        return { month, income: fromCents(incomeCents), expenses: fromCents(expenseCents) };
      }),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The client sends its own date, so "still active" and "next charge" follow
// the visitor's calendar rather than the server's time zone.
const recurringQuerySchema = z.object({ today: z.iso.date().optional() });

// Charges that repeat on a schedule, with their combined monthly cost.
summaryRouter.get('/recurring', async (req, res) => {
  const query = recurringQuerySchema.safeParse(req.query);
  if (!query.success) return invalidQuery(res, query.error);

  const today = query.data.today ?? new Date().toISOString().slice(0, 10);
  const since = new Date(Date.parse(today) - RECURRING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const items = detectRecurring(await recurringCandidates(req.user.id, since), today);
    const monthlyCents = items.reduce((sum, item) => sum + toCents(item.monthly_amount), 0);
    res.json({ items, monthly_total: fromCents(monthlyCents) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
