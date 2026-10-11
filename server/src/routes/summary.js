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
