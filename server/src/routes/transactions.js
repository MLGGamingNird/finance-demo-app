import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/requireAuth.js';
import { PG_FOREIGN_KEY_VIOLATION, validateBody, validateIdParam } from '../lib/validate.js';
import { monthRange, monthSchema } from '../lib/month.js';
import { suggestCategory } from '../lib/categorize.js';
import { afterCursorFilter, decodeCursor, encodeCursor } from '../lib/pagination.js';

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

const COLUMNS = 'id, description, amount, category_id, auto_categorized, occurred_at, created_at';

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

// Optional filters: ?month=YYYY-MM and ?category_id=<uuid>|none. Results come
// in pages of ?limit= rows; pass the returned next_cursor as ?cursor= for the
// next page. next_cursor is null on the last page.
const listQuerySchema = z.object({
  month: monthSchema.optional(),
  category_id: z.union([z.uuid('Invalid category'), z.literal('none')]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(500).optional(),
});

transactionsRouter.get('/', async (req, res) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: 'Invalid query', fields: z.flattenError(query.error).fieldErrors });
  }
  const { month, category_id, limit, cursor } = query.data;

  const after = cursor === undefined ? null : decodeCursor(cursor);
  if (cursor !== undefined && !after) {
    return res.status(400).json({ error: 'Invalid query', fields: { cursor: ['Invalid cursor'] } });
  }

  let request = supabase.from('transactions').select(COLUMNS).eq('user_id', req.user.id);

  if (month) {
    const [start, end] = monthRange(month);
    request = request.gte('occurred_at', start).lt('occurred_at', end);
  }
  if (category_id === 'none') request = request.is('category_id', null);
  else if (category_id) request = request.eq('category_id', category_id);
  if (after) request = request.or(afterCursorFilter(after));

  // One extra row tells us whether another page exists.
  const { data, error } = await request
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (error) return res.status(500).json({ error: error.message });
  const items = data.slice(0, limit);
  res.json({ items, next_cursor: data.length > limit ? encodeCursor(items.at(-1)) : null });
});

// Leaving category_id out asks the server to pick one; sending null means
// "uncategorized" on purpose.
transactionsRouter.post('/', validateBody(createTransactionSchema), async (req, res) => {
  const row = { ...req.body, user_id: req.user.id };
  if (row.category_id === undefined) {
    row.category_id = await suggestCategory(req.user.id, row);
    row.auto_categorized = row.category_id !== null;
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert(row)
    .select(COLUMNS)
    .single();

  if (error) return sendDbError(res, error);
  res.status(201).json(data);
});

transactionsRouter.patch('/:id', validateIdParam, validateBody(updateTransactionSchema), async (req, res) => {
  // A category the user chose themselves is no longer an automatic one.
  const changes = 'category_id' in req.body ? { ...req.body, auto_categorized: false } : req.body;

  const { data, error } = await supabase
    .from('transactions')
    .update(changes)
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
