import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/requireAuth.js';
import { monthRange, monthSchema } from '../lib/month.js';

export const summaryRouter = Router();

summaryRouter.use(requireAuth);

const querySchema = z.object({ month: monthSchema });

const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => cents / 100;

// Totals for one month. Summed in integer cents so float error can't
// creep into the displayed totals.
summaryRouter.get('/', async (req, res) => {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: 'Invalid query', fields: z.flattenError(query.error).fieldErrors });
  }

  const [start, end] = monthRange(query.data.month);
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, category_id')
    .eq('user_id', req.user.id)
    .gte('occurred_at', start)
    .lt('occurred_at', end);

  if (error) return res.status(500).json({ error: error.message });

  let incomeCents = 0;
  let expenseCents = 0;
  const spentByCategory = new Map();

  for (const { amount, category_id } of data) {
    const cents = toCents(amount);
    if (cents > 0) {
      incomeCents += cents;
    } else {
      expenseCents -= cents;
      const key = category_id ?? null;
      spentByCategory.set(key, (spentByCategory.get(key) ?? 0) - cents);
    }
  }

  res.json({
    month: query.data.month,
    income: fromCents(incomeCents),
    expenses: fromCents(expenseCents),
    net: fromCents(incomeCents - expenseCents),
    spending_by_category: [...spentByCategory]
      .map(([category_id, cents]) => ({ category_id, spent: fromCents(cents) }))
      .sort((a, b) => b.spent - a.spent),
  });
});

const trendQuerySchema = z.object({
  end: monthSchema,
  months: z.coerce.number().int().min(1).max(24).default(6),
});

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

// Income and spending per month for the `months` months ending at `end`.
// Months with no activity are included as zeros so the chart has no gaps.
summaryRouter.get('/trend', async (req, res) => {
  const query = trendQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: 'Invalid query', fields: z.flattenError(query.error).fieldErrors });
  }

  const { end, months } = query.data;
  const monthList = Array.from({ length: months }, (_, i) => shiftMonth(end, i - months + 1));
  const [start] = monthRange(monthList[0]);
  const [, endExclusive] = monthRange(end);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, occurred_at')
    .eq('user_id', req.user.id)
    .gte('occurred_at', start)
    .lt('occurred_at', endExclusive);

  if (error) return res.status(500).json({ error: error.message });

  const totals = new Map(monthList.map((m) => [m, { incomeCents: 0, expenseCents: 0 }]));
  for (const { amount, occurred_at } of data) {
    const bucket = totals.get(occurred_at.slice(0, 7));
    const cents = toCents(amount);
    if (cents > 0) bucket.incomeCents += cents;
    else bucket.expenseCents -= cents;
  }

  res.json(
    monthList.map((month) => {
      const { incomeCents, expenseCents } = totals.get(month);
      return { month, income: fromCents(incomeCents), expenses: fromCents(expenseCents) };
    }),
  );
});
