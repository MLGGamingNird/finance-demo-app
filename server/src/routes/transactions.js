import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/requireAuth.js';

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

transactionsRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('occurred_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

transactionsRouter.post('/', async (req, res) => {
  const { amount, description, category, occurred_at } = req.body;

  if (amount === undefined || !description) {
    return res.status(400).json({ error: 'amount and description are required' });
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: req.user.id,
      amount,
      description,
      category: category ?? null,
      occurred_at: occurred_at ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

transactionsRouter.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});
