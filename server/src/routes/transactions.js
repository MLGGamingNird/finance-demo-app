import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/requireAuth.js';
import { PG_FOREIGN_KEY_VIOLATION, validateBody, validateIdParam } from '../lib/validate.js';

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

const COLUMNS = 'id, description, amount, category_id, occurred_at, created_at';

// Negative amounts are expenses, positive are income.
const amount = z
  .number({ error: 'Amount must be a number' })
  .refine((n) => n !== 0, 'Amount cannot be zero')
  .refine((n) => Math.abs(n) < 1_000_000_000, 'Amount is too large')
  .refine((n) => Math.round(n * 100) / 100 === n, 'Amount can have at most 2 decimal places');

const transactionFields = {
  description: z.string({ error: 'Description is required' }).trim().min(1, 'Description is required').max(100, 'Description must be 100 characters or fewer'),
  amount,
  category_id: z.uuid('Invalid category').nullable(),
  occurred_at: z.iso.date('Date must be YYYY-MM-DD'),
};

const createTransactionSchema = z.strictObject({
  description: transactionFields.description,
  amount: transactionFields.amount,
  category_id: transactionFields.category_id.optional(),
  occurred_at: transactionFields.occurred_at.optional(),
});

const updateTransactionSchema = z
  .strictObject(transactionFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

function sendDbError(res, error) {
  if (error.code === PG_FOREIGN_KEY_VIOLATION) {
    return res.status(400).json({ error: 'Invalid request body', fields: { category_id: ['Unknown category'] } });
  }
  res.status(500).json({ error: error.message });
}

transactionsRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select(COLUMNS)
    .eq('user_id', req.user.id)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

transactionsRouter.post('/', validateBody(createTransactionSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...req.body, user_id: req.user.id })
    .select(COLUMNS)
    .single();

  if (error) return sendDbError(res, error);
  res.status(201).json(data);
});

transactionsRouter.patch('/:id', validateIdParam, validateBody(updateTransactionSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) return sendDbError(res, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

transactionsRouter.delete('/:id', validateIdParam, async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id');

  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
