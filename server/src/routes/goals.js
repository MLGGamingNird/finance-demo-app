import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/requireAuth.js';
import { validateBody, validateIdParam } from '../lib/validate.js';
import { monthRange, shiftMonth } from '../lib/month.js';
import { fromCents, toCents } from '../lib/money.js';
import { spendingByMonth } from '../lib/spending.js';
import { PACE_MONTHS, projectGoal, savingsPace } from '../lib/goals.js';

export const goalsRouter = Router();

goalsRouter.use(requireAuth);

const COLUMNS = 'id, name, target_amount, saved_amount, target_date, created_at';
const MAX_GOALS = 20;

const money = (label) =>
  z
    .number({ error: `${label} must be a number` })
    .max(1_000_000_000, `${label} is too large`)
    .refine((n) => Math.round(n * 100) / 100 === n, `${label} can have at most 2 decimal places`);

const goalFields = {
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(60, 'Name must be 60 characters or fewer'),
  target_amount: money('Target').positive('Target must be greater than zero'),
  saved_amount: money('Saved amount').nonnegative('Saved amount cannot be negative'),
  target_date: z.iso.date('Date must be YYYY-MM-DD').nullable(),
};

const createGoalSchema = z.strictObject({
  ...goalFields,
  saved_amount: goalFields.saved_amount.default(0),
  target_date: goalFields.target_date.default(null),
});

const updateGoalSchema = z
  .strictObject(goalFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

// The client sends its own date so "this month" matches the visitor's calendar.
const listQuerySchema = z.object({ today: z.iso.date().optional() });

async function monthlyPace(userId, currentMonth) {
  const [start] = monthRange(shiftMonth(currentMonth, -PACE_MONTHS));
  const [end] = monthRange(currentMonth);
  const rows = await spendingByMonth(userId, start, end);

  const totals = new Map();
  for (const row of rows) {
    const bucket = totals.get(row.month) ?? { incomeCents: 0, expenseCents: 0 };
    bucket.incomeCents += toCents(row.income);
    bucket.expenseCents += toCents(row.expenses);
    totals.set(row.month, bucket);
  }
  return savingsPace([...totals.values()]);
}

goalsRouter.get('/', async (req, res) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: 'Invalid query', fields: z.flattenError(query.error).fieldErrors });
  }
  const currentMonth = (query.data.today ?? new Date().toISOString()).slice(0, 7);

  try {
    const { data, error } = await supabase
      .from('savings_goals')
      .select(COLUMNS)
      .eq('user_id', req.user.id)
      .order('created_at');
    if (error) throw error;

    const paceCents = await monthlyPace(req.user.id, currentMonth);
    res.json({
      monthly_pace: paceCents === null ? null : fromCents(paceCents),
      goals: data.map((goal) => projectGoal(goal, paceCents, currentMonth)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

goalsRouter.post('/', validateBody(createGoalSchema), async (req, res) => {
  const { count, error: countError } = await supabase
    .from('savings_goals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id);
  if (countError) return res.status(500).json({ error: countError.message });
  if (count >= MAX_GOALS) return res.status(400).json({ error: `You can have up to ${MAX_GOALS} goals` });

  const { data, error } = await supabase
    .from('savings_goals')
    .insert({ ...req.body, user_id: req.user.id })
    .select(COLUMNS)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

goalsRouter.patch('/:id', validateIdParam, validateBody(updateGoalSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('savings_goals')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

goalsRouter.delete('/:id', validateIdParam, async (req, res) => {
  const { data, error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id');

  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
