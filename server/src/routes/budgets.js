import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/requireAuth.js';
import { validateBody } from '../lib/validate.js';

export const budgetsRouter = Router();

budgetsRouter.use(requireAuth);

const COLUMNS = 'id, category_id, amount';

const setBudgetSchema = z.strictObject({
  amount: z
    .number({ error: 'Amount must be a number' })
    .positive('Budget must be greater than zero')
    .max(1_000_000_000, 'Budget is too large')
    .refine((n) => Math.round(n * 100) / 100 === n, 'Budget can have at most 2 decimal places'),
});

function validateCategoryParam(req, res, next) {
  if (!z.uuid().safeParse(req.params.categoryId).success) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

budgetsRouter.get('/', async (req, res) => {
  const { data, error } = await supabase.from('budgets').select(COLUMNS).eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Budgets are keyed by category, so setting one is an idempotent upsert.
budgetsRouter.put('/:categoryId', validateCategoryParam, validateBody(setBudgetSchema), async (req, res) => {
  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('kind')
    .eq('id', req.params.categoryId)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (categoryError) return res.status(500).json({ error: categoryError.message });
  if (!category) return res.status(404).json({ error: 'Category not found' });
  if (category.kind !== 'expense') {
    return res.status(400).json({ error: 'Budgets can only be set on expense categories' });
  }

  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      {
        user_id: req.user.id,
        category_id: req.params.categoryId,
        amount: req.body.amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,category_id' },
    )
    .select(COLUMNS)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

budgetsRouter.delete('/:categoryId', validateCategoryParam, async (req, res) => {
  const { data, error } = await supabase
    .from('budgets')
    .delete()
    .eq('category_id', req.params.categoryId)
    .eq('user_id', req.user.id)
    .select('id');

  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
