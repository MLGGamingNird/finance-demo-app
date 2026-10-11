import { createHmac } from 'node:crypto';
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';

export const demoRouter = Router();

const DEMO_EMAIL = 'demo@finance-demo-app.dev';

// Derived from the service role key so the password stays server-side
// without needing another env var.
const DEMO_PASSWORD = createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY)
  .update('finance-demo-user')
  .digest('hex');

// [description, amount, category, days ago] — negative amounts are expenses.
const SEED_TRANSACTIONS = [
  ['Paycheck', 2850, 'Income', 2],
  ['Rent', -1450, 'Housing', 3],
  ['Trader Joe\'s', -86.42, 'Groceries', 4],
  ['Starbucks', -6.75, 'Food & Drink', 5],
  ['Netflix', -15.49, 'Subscriptions', 7],
  ['Shell Gas', -48.1, 'Transport', 9],
  ['Chipotle', -13.25, 'Food & Drink', 11],
  ['Electric bill', -72.3, 'Utilities', 13],
  ['Freelance project', 400, 'Income', 15],
  ['Paycheck', 2850, 'Income', 16],
  ['Amazon', -39.99, 'Shopping', 18],
  ['Whole Foods', -112.58, 'Groceries', 20],
  ['Gym membership', -35, 'Health', 23],
  ['Uber', -18.6, 'Transport', 26],
  ['Spotify', -11.99, 'Subscriptions', 28],
  ['Dinner out', -64.2, 'Food & Drink', 31],
];

// A fresh client per sign-in so the shared service-role client never
// picks up the demo user's session.
function createSignInClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findDemoUser() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === DEMO_EMAIL) ?? null;
}

async function ensureDemoUser() {
  const existing = await findDemoUser();
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    return;
  }

  const { error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
}

async function signInDemoUser() {
  const client = createSignInClient();
  let result = await client.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

  if (result.error) {
    await ensureDemoUser();
    result = await client.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (result.error) throw result.error;
  }

  return result.data;
}

async function resetDemoData(userId) {
  const { error: deleteError } = await supabase.from('transactions').delete().eq('user_id', userId);
  if (deleteError) throw deleteError;

  const now = Date.now();
  const rows = SEED_TRANSACTIONS.map(([description, amount, category, daysAgo]) => ({
    user_id: userId,
    description,
    amount,
    category,
    occurred_at: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { error: insertError } = await supabase.from('transactions').insert(rows);
  if (insertError) throw insertError;
}

demoRouter.post('/session', async (req, res) => {
  try {
    const { session, user } = await signInDemoUser();
    await resetDemoData(user.id);
    res.json({ access_token: session.access_token, refresh_token: session.refresh_token });
  } catch (err) {
    console.error('Demo sign-in failed:', err);
    res.status(500).json({ error: 'Could not start demo session' });
  }
});
