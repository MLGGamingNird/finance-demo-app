import { supabase } from './supabase.js';

export const DEFAULT_CATEGORIES = [
  { name: 'Income', kind: 'income' },
  { name: 'Housing', kind: 'expense' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Food & Drink', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Utilities', kind: 'expense' },
  { name: 'Subscriptions', kind: 'expense' },
  { name: 'Shopping', kind: 'expense' },
  { name: 'Health', kind: 'expense' },
  { name: 'Entertainment', kind: 'expense' },
  { name: 'Other', kind: 'expense' },
];

// Gives a new user a starter set. ignoreDuplicates keeps concurrent
// first requests from colliding on the (user_id, name) constraint.
export async function seedDefaultCategories(userId) {
  const { error } = await supabase
    .from('categories')
    .upsert(
      DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: userId })),
      { onConflict: 'user_id,name', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function listCategories(userId) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, kind')
    .eq('user_id', userId)
    .order('kind', { ascending: false })
    .order('name');
  if (error) throw error;
  return data;
}
