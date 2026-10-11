import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/requireAuth.js';
import { listCategories, seedDefaultCategories } from '../lib/categories.js';
import { PG_UNIQUE_VIOLATION, validateBody, validateIdParam } from '../lib/validate.js';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

const createCategorySchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(40, 'Name must be 40 characters or fewer'),
  kind: z.enum(['income', 'expense']),
});

categoriesRouter.get('/', async (req, res) => {
  try {
    let categories = await listCategories(req.user.id);
    if (categories.length === 0) {
      await seedDefaultCategories(req.user.id);
      categories = await listCategories(req.user.id);
    }
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

categoriesRouter.post('/', validateBody(createCategorySchema), async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .insert({ ...req.body, user_id: req.user.id })
    .select('id, name, kind')
    .single();

  if (error?.code === PG_UNIQUE_VIOLATION) {
    return res.status(409).json({ error: 'A category with that name already exists' });
  }
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Transactions in a deleted category keep existing, uncategorized.
categoriesRouter.delete('/:id', validateIdParam, async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id');

  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
