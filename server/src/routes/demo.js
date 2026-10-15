import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { listCategories, seedDefaultCategories } from '../lib/categories.js';
import { rateLimit } from '../lib/rateLimit.js';

export const demoRouter = Router();

// Every "Try the demo" click gets its own throwaway account, so visitors
// never see each other's changes. Sandboxes expire after a day.
export const SANDBOX_TTL_MS = 24 * 60 * 60 * 1000;
// Caps live sandboxes so a flood of clicks can't fill the free-tier database.
// DEMO_MAX_SANDBOXES overrides it.
const DEFAULT_MAX_SANDBOXES = 500;
const CLEANUP_BATCH = 25;

const demoLimiter = rateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: (req) => req.ip });

// Negative amounts are expenses. Bills repeat each month on a fixed day:
// [description, amount, category, day of month]
const SEED_RECURRING = [
  ['Paycheck', 2850, 'Income', 1],
  ['Rent', -1450, 'Housing', 1],
  ['Gym membership', -35, 'Health', 5],
  ['Netflix', -15.49, 'Subscriptions', 7],
  ['Electric bill', -72.3, 'Utilities', 12],
  ['Paycheck', 2850, 'Income', 15],
  ['Phone bill', -55, 'Utilities', 18],
  ['Spotify', -11.99, 'Subscriptions', 20],
];

// One-off spending, placed relative to today: [description, amount, category, days ago]
const SEED_ONE_OFF = [
  ['Starbucks', -6.75, 'Food & Drink', 1],
  ["Trader Joe's", -86.42, 'Groceries', 2],
  ['Shell Gas', -48.1, 'Transport', 3],
  ['Chipotle', -13.25, 'Food & Drink', 4],
  ['Movie tickets', -32, 'Entertainment', 6],
  ['Whole Foods', -112.58, 'Groceries', 8],
  ['Amazon', -39.99, 'Shopping', 10],
  ['Uber', -18.6, 'Transport', 12],
  ['Dinner out', -64.2, 'Food & Drink', 14],
  ['Freelance project', 400, 'Income', 16],
  ["Trader Joe's", -94.17, 'Groceries', 17],
  ['Target', -58.33, 'Shopping', 20],
  ['Shell Gas', -51.4, 'Transport', 23],
  ['Concert', -85, 'Entertainment', 26],
  ['Whole Foods', -128.9, 'Groceries', 29],
  ['Starbucks', -5.95, 'Food & Drink', 31],
  ['Pharmacy', -24.5, 'Health', 34],
  ["Trader Joe's", -79.6, 'Groceries', 38],
  ['Lyft', -22.15, 'Transport', 41],
  ['Brunch', -46.8, 'Food & Drink', 44],
  ['Amazon', -112.4, 'Shopping', 47],
  ['Whole Foods', -101.25, 'Groceries', 52],
  ['Shell Gas', -46.75, 'Transport', 55],
  ['Freelance project', 650, 'Income', 58],
  ['Pizza night', -38.5, 'Food & Drink', 61],
  ["Trader Joe's", -88.1, 'Groceries', 65],
  ['Bookstore', -27.99, 'Shopping', 69],
  ['Uber', -15.3, 'Transport', 73],
  ['Whole Foods', -134.7, 'Groceries', 78],
  ['Mini golf', -24, 'Entertainment', 82],
];

// Monthly limits by category name. A couple are set tight so the demo
// shows over-budget states.
const SEED_BUDGETS = [
  ['Groceries', 400],
  ['Food & Drink', 120],
  ['Transport', 150],
  ['Shopping', 100],
  ['Entertainment', 75],
  ['Subscriptions', 25],
];

const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Six months of history up to today, so the trend chart is full.
const SEED_MONTHS = 6;

// The one-off list covers ~3 months; earlier cycles repeat it at slightly
// different amounts so the months don't look identical.
const ONE_OFF_CYCLES = [
  { offsetDays: 0, scale: 1 },
  { offsetDays: 91, scale: 0.9 },
];

function seedRows(userId, categoryIds) {
  const today = new Date();
  const rows = [];
  const add = (description, amount, category, date) =>
    rows.push({
      user_id: userId,
      description,
      amount,
      category_id: categoryIds.get(category) ?? null,
      occurred_at: toISODate(date),
    });

  for (let back = SEED_MONTHS - 1; back >= 0; back--) {
    for (const [description, amount, category, day] of SEED_RECURRING) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, day));
      if (date <= today) add(description, amount, category, date);
    }
  }
  for (const { offsetDays, scale } of ONE_OFF_CYCLES) {
    for (const [description, amount, category, daysAgo] of SEED_ONE_OFF) {
      const scaled = Math.round(amount * scale * 100) / 100;
      add(description, scaled, category, new Date(today.getTime() - (daysAgo + offsetDays) * DAY_MS));
    }
  }
  return rows;
}

// A fresh client per sign-in so the shared service-role client never
// picks up the sandbox user's session.
function createSignInClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function seedDemoData(userId) {
  await seedDefaultCategories(userId);
  const categoryIds = new Map((await listCategories(userId)).map((c) => [c.name, c.id]));

  const { error: insertError } = await supabase.from('transactions').insert(seedRows(userId, categoryIds));
  if (insertError) throw insertError;

  const { error: budgetsError } = await supabase.from('budgets').insert(
    SEED_BUDGETS.map(([category, amount]) => ({ user_id: userId, category_id: categoryIds.get(category), amount })),
  );
  if (budgetsError) throw budgetsError;
}

async function countLiveSandboxes() {
  const { count, error } = await supabase
    .from('demo_sandboxes')
    .select('user_id', { count: 'exact', head: true })
    .gt('created_at', new Date(Date.now() - SANDBOX_TTL_MS).toISOString());
  if (error) throw error;
  return count;
}

// Deletes the oldest expired sandboxes, a batch at a time. Deleting the auth
// user cascades to all of its data. Returns how many were deleted.
export async function deleteExpiredSandboxes() {
  const { data, error } = await supabase
    .from('demo_sandboxes')
    .select('user_id')
    .lte('created_at', new Date(Date.now() - SANDBOX_TTL_MS).toISOString())
    .order('created_at')
    .limit(CLEANUP_BATCH);
  if (error) throw error;

  for (const { user_id } of data) {
    // A 404 means a concurrent cleanup got there first.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteError && deleteError.status !== 404) throw deleteError;
  }
  return data.length;
}

// The password is random and used once, right here, so it never leaves the
// server. app_metadata can only be set with the service role, so the client
// can trust the demo flag.
async function createSandbox() {
  const email = `demo-${randomUUID()}@finance-demo-app.dev`;
  const password = randomBytes(24).toString('base64url');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { demo: true },
  });
  if (error) throw error;
  const userId = data.user.id;

  try {
    const { error: sandboxError } = await supabase.from('demo_sandboxes').insert({ user_id: userId });
    if (sandboxError) throw sandboxError;
    await seedDemoData(userId);

    const { data: signIn, error: signInError } = await createSignInClient().auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return signIn.session;
  } catch (err) {
    // Don't leave a half-built account behind.
    await supabase.auth.admin.deleteUser(userId);
    throw err;
  }
}

demoRouter.post('/session', demoLimiter, async (req, res) => {
  // Runs alongside the request, so the visitor never waits on it.
  deleteExpiredSandboxes().catch((err) => console.error('Sandbox cleanup failed:', err));

  try {
    const max = Number(process.env.DEMO_MAX_SANDBOXES ?? DEFAULT_MAX_SANDBOXES);
    if ((await countLiveSandboxes()) >= max) {
      return res.status(503).json({ error: 'The demo is busy right now. Please try again later.' });
    }
    const session = await createSandbox();
    res.json({ access_token: session.access_token, refresh_token: session.refresh_token });
  } catch (err) {
    console.error('Demo sign-in failed:', err);
    res.status(500).json({ error: 'Could not start demo session' });
  }
});
