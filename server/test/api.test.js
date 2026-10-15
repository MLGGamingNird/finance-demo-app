import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { adminClient, canRunIntegration, createTestUser, deleteTestUser, userClient } from './helpers.js';

// AI calls are covered by their fallback paths; tests never call Groq.
delete process.env.GROQ_API_KEY;

describe.skipIf(!canRunIntegration)('API (integration)', () => {
  let app;
  let alice;
  let bob;

  const as = (user) => ({
    get: (path) => request(app).get(path).set('Authorization', `Bearer ${user.token}`),
    post: (path, body) => request(app).post(path).set('Authorization', `Bearer ${user.token}`).send(body),
    put: (path, body) => request(app).put(path).set('Authorization', `Bearer ${user.token}`).send(body),
    patch: (path, body) => request(app).patch(path).set('Authorization', `Bearer ${user.token}`).send(body),
    delete: (path) => request(app).delete(path).set('Authorization', `Bearer ${user.token}`),
  });

  async function categoryId(user, name) {
    const res = await as(user).get('/api/categories');
    return res.body.find((c) => c.name === name).id;
  }

  beforeAll(async () => {
    ({ app } = await import('../src/app.js'));
    [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  });

  describe('authentication', () => {
    it('rejects requests without a token', async () => {
      for (const path of ['/api/transactions', '/api/categories', '/api/budgets', '/api/summary?month=2026-01']) {
        const res = await request(app).get(path);
        expect(res.status, path).toBe(401);
      }
    });

    it('rejects an invalid token', async () => {
      const res = await request(app).get('/api/transactions').set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
    });
  });

  describe('categories', () => {
    it('gives a new user the default categories', async () => {
      const res = await as(alice).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(11);
      expect(res.body).toContainEqual(expect.objectContaining({ name: 'Income', kind: 'income' }));
      expect(res.body).toContainEqual(expect.objectContaining({ name: 'Groceries', kind: 'expense' }));
    });

    it('rejects duplicate names', async () => {
      const first = await as(alice).post('/api/categories', { name: 'Pets', kind: 'expense' });
      expect(first.status).toBe(201);
      const dupe = await as(alice).post('/api/categories', { name: 'Pets', kind: 'expense' });
      expect(dupe.status).toBe(409);
    });
  });

  describe('transactions', () => {
    it('creates, updates and deletes a transaction', async () => {
      const groceries = await categoryId(alice, 'Groceries');
      const created = await as(alice).post('/api/transactions', {
        description: 'Farmers market',
        amount: -32.5,
        category_id: groceries,
        occurred_at: '2026-01-15',
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        description: 'Farmers market',
        amount: -32.5,
        category_id: groceries,
        auto_categorized: false,
        occurred_at: '2026-01-15',
      });

      const updated = await as(alice).patch(`/api/transactions/${created.body.id}`, { amount: -40 });
      expect(updated.status).toBe(200);
      expect(updated.body.amount).toBe(-40);

      const deleted = await as(alice).delete(`/api/transactions/${created.body.id}`);
      expect(deleted.status).toBe(204);
      const again = await as(alice).delete(`/api/transactions/${created.body.id}`);
      expect(again.status).toBe(404);
    });

    it('returns field-level errors for invalid input', async () => {
      const res = await as(alice).post('/api/transactions', {
        description: '  ',
        amount: 1.234,
        occurred_at: '01/15/2026',
      });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.fields).sort()).toEqual(['amount', 'description', 'occurred_at']);

      const zero = await as(alice).post('/api/transactions', { description: 'x', amount: 0 });
      expect(zero.body.fields.amount).toEqual(['Amount cannot be zero']);
    });

    it("won't let the client set fields like user_id", async () => {
      const res = await as(alice).post('/api/transactions', { description: 'x', amount: -1, user_id: bob.id });
      expect(res.status).toBe(400);
    });

    it('filters by month and category', async () => {
      const transport = await categoryId(alice, 'Transport');
      await as(alice).post('/api/transactions', { description: 'Train', amount: -12, category_id: transport, occurred_at: '2025-06-03' });
      await as(alice).post('/api/transactions', { description: 'Bus', amount: -3, category_id: transport, occurred_at: '2025-07-03' });

      const june = await as(alice).get('/api/transactions?month=2025-06');
      expect(june.body.items.map((t) => t.description)).toEqual(['Train']);

      const byCategory = await as(alice).get(`/api/transactions?category_id=${transport}`);
      expect(byCategory.body.items.map((t) => t.description).sort()).toEqual(['Bus', 'Train']);

      const bad = await as(alice).get('/api/transactions?month=2025-13');
      expect(bad.status).toBe(400);
    });

    it('pages through every row exactly once, newest first', async () => {
      // One batch insert gives all rows the same created_at, so only the id
      // keeps the order stable across pages.
      const rows = ['2019-02-03', '2019-02-03', '2019-02-03', '2019-02-01', '2019-02-01'].map((occurred_at, i) => ({
        user_id: alice.id,
        description: `Paged ${i}`,
        amount: -(i + 1),
        occurred_at,
      }));
      const { error } = await adminClient().from('transactions').insert(rows);
      expect(error).toBeNull();

      const all = await as(alice).get('/api/transactions?month=2019-02&limit=100');
      expect(all.body.items).toHaveLength(5);
      expect(all.body.next_cursor).toBeNull();

      const paged = [];
      let cursor = null;
      do {
        const params = new URLSearchParams({ month: '2019-02', limit: '2' });
        if (cursor) params.set('cursor', cursor);
        const page = await as(alice).get(`/api/transactions?${params}`);
        expect(page.status).toBe(200);
        expect(page.body.items.length).toBeLessThanOrEqual(2);
        paged.push(...page.body.items);
        cursor = page.body.next_cursor;
      } while (cursor);

      expect(paged.map((t) => t.id)).toEqual(all.body.items.map((t) => t.id));
      expect(paged.map((t) => t.occurred_at)).toEqual(['2019-02-03', '2019-02-03', '2019-02-03', '2019-02-01', '2019-02-01']);
    });

    it('rejects bad page sizes and cursors', async () => {
      expect((await as(alice).get('/api/transactions?limit=0')).status).toBe(400);
      expect((await as(alice).get('/api/transactions?limit=101')).status).toBe(400);
      const bad = await as(alice).get('/api/transactions?cursor=not-a-cursor');
      expect(bad.status).toBe(400);
      expect(bad.body.fields.cursor).toEqual(['Invalid cursor']);
    });

    it('returns 404 for malformed ids instead of a database error', async () => {
      expect((await as(alice).patch('/api/transactions/123', { amount: -1 })).status).toBe(404);
      expect((await as(alice).delete('/api/transactions/123')).status).toBe(404);
    });
  });

  describe('budgets', () => {
    it('sets, updates and removes a budget on an expense category', async () => {
      const shopping = await categoryId(alice, 'Shopping');
      expect((await as(alice).put(`/api/budgets/${shopping}`, { amount: 100 })).status).toBe(200);
      const updated = await as(alice).put(`/api/budgets/${shopping}`, { amount: 150 });
      expect(updated.body.amount).toBe(150);

      const list = await as(alice).get('/api/budgets');
      expect(list.body).toContainEqual(expect.objectContaining({ category_id: shopping, amount: 150 }));

      expect((await as(alice).delete(`/api/budgets/${shopping}`)).status).toBe(204);
    });

    it('rejects budgets on income categories and non-positive amounts', async () => {
      const income = await categoryId(alice, 'Income');
      expect((await as(alice).put(`/api/budgets/${income}`, { amount: 10 })).status).toBe(400);
      const health = await categoryId(alice, 'Health');
      expect((await as(alice).put(`/api/budgets/${health}`, { amount: 0 })).status).toBe(400);
    });

    it('removes the budget and uncategorizes transactions when a category is deleted', async () => {
      const pets = (await as(alice).post('/api/categories', { name: 'Pet care', kind: 'expense' })).body.id;
      await as(alice).put(`/api/budgets/${pets}`, { amount: 50 });
      const txn = await as(alice).post('/api/transactions', { description: 'Vet', amount: -80, category_id: pets });

      expect((await as(alice).delete(`/api/categories/${pets}`)).status).toBe(204);

      const budgets = await as(alice).get('/api/budgets');
      expect(budgets.body.some((b) => b.category_id === pets)).toBe(false);
      const list = await as(alice).get('/api/transactions');
      expect(list.body.items.find((t) => t.id === txn.body.id).category_id).toBeNull();
    });
  });

  describe('summary', () => {
    it('totals a month exactly, in Postgres', async () => {
      const food = await categoryId(alice, 'Food & Drink');
      for (const amount of [-0.1, -0.2]) {
        await as(alice).post('/api/transactions', { description: 'Gum', amount, category_id: food, occurred_at: '2020-03-10' });
      }
      await as(alice).post('/api/transactions', { description: 'Pay', amount: 1000, category_id: null, occurred_at: '2020-03-01' });

      const res = await as(alice).get('/api/summary?month=2020-03');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ month: '2020-03', income: 1000, expenses: 0.3, net: 999.7 });
      expect(res.body.spending_by_category).toEqual([{ category_id: food, spent: 0.3 }]);
    });

    it('returns a zero-filled monthly trend', async () => {
      const res = await as(alice).get('/api/summary/trend?end=2020-03&months=3');
      expect(res.body).toEqual([
        { month: '2020-01', income: 0, expenses: 0 },
        { month: '2020-02', income: 0, expenses: 0 },
        { month: '2020-03', income: 1000, expenses: 0.3 },
      ]);
    });

    it('validates query parameters', async () => {
      expect((await as(alice).get('/api/summary')).status).toBe(400);
      expect((await as(alice).get('/api/summary/trend?end=2020-03&months=99')).status).toBe(400);
    });
  });

  describe('auto-categorization (without AI)', () => {
    it("reuses the category from the user's own history", async () => {
      const food = await categoryId(alice, 'Food & Drink');
      await as(alice).post('/api/transactions', { description: 'Corner Bakery', amount: -8, category_id: food });

      const auto = await as(alice).post('/api/transactions', { description: '  corner   BAKERY ', amount: -6 });
      expect(auto.body).toMatchObject({ category_id: food, auto_categorized: true });

      // Editing the category makes it a manual choice.
      const groceries = await categoryId(alice, 'Groceries');
      const edited = await as(alice).patch(`/api/transactions/${auto.body.id}`, { category_id: groceries });
      expect(edited.body.auto_categorized).toBe(false);
    });

    it('leaves it uncategorized when there is no match, or when null is sent on purpose', async () => {
      const unknown = await as(alice).post('/api/transactions', { description: 'Zxqv 8812', amount: -3 });
      expect(unknown.body).toMatchObject({ category_id: null, auto_categorized: false });

      const explicit = await as(alice).post('/api/transactions', { description: 'Corner Bakery', amount: -5, category_id: null });
      expect(explicit.body).toMatchObject({ category_id: null, auto_categorized: false });
    });
  });

  describe('chat', () => {
    it('reports that AI is not configured instead of failing', async () => {
      const res = await as(alice).post('/api/chat', { messages: [{ role: 'user', content: 'Hi' }] });
      expect(res.status).toBe(503);
    });

    it('requires the last message to come from the user', async () => {
      const res = await as(alice).post('/api/chat', { messages: [{ role: 'assistant', content: 'Hi' }] });
      expect(res.status).toBe(400);
    });
  });

  // The API checks ownership on every query, and Postgres enforces it again
  // with row-level security and composite foreign keys. Both layers are
  // tested independently.
  describe("isolation: Bob can't see or touch Alice's data", () => {
    let aliceTxn;
    let aliceCategory;

    beforeAll(async () => {
      aliceCategory = (await as(alice).post('/api/categories', { name: 'Secret hobby', kind: 'expense' })).body.id;
      aliceTxn = (
        await as(alice).post('/api/transactions', {
          description: 'Private purchase',
          amount: -999,
          category_id: aliceCategory,
          occurred_at: '2021-05-05',
        })
      ).body;
      await as(bob).get('/api/categories'); // give Bob his defaults
    });

    describe('through the API', () => {
      it("doesn't list Alice's transactions or categories", async () => {
        const txns = await as(bob).get('/api/transactions');
        expect(txns.body.items.some((t) => t.id === aliceTxn.id)).toBe(false);
        const cats = await as(bob).get('/api/categories');
        expect(cats.body.some((c) => c.id === aliceCategory)).toBe(false);
      });

      it("can't edit or delete Alice's transaction", async () => {
        expect((await as(bob).patch(`/api/transactions/${aliceTxn.id}`, { amount: -1 })).status).toBe(404);
        expect((await as(bob).delete(`/api/transactions/${aliceTxn.id}`)).status).toBe(404);

        const stillThere = await as(alice).get('/api/transactions?month=2021-05');
        expect(stillThere.body.items).toContainEqual(expect.objectContaining({ id: aliceTxn.id, amount: -999 }));
      });

      it("can't file his own transaction under Alice's category", async () => {
        const res = await as(bob).post('/api/transactions', { description: 'x', amount: -1, category_id: aliceCategory });
        expect(res.status).toBe(400);
        expect(res.body.fields.category_id).toEqual(['Unknown category']);
      });

      it("can't budget or delete Alice's category", async () => {
        expect((await as(bob).put(`/api/budgets/${aliceCategory}`, { amount: 10 })).status).toBe(404);
        expect((await as(bob).delete(`/api/categories/${aliceCategory}`)).status).toBe(404);
      });

      it("doesn't count Alice's spending in his summary", async () => {
        const res = await as(bob).get('/api/summary?month=2021-05');
        expect(res.body).toMatchObject({ income: 0, expenses: 0, spending_by_category: [] });
      });
    });

    describe.skipIf(!process.env.SUPABASE_ANON_KEY)('directly against Postgres (row-level security)', () => {
      it("returns none of Alice's rows to Bob's session", async () => {
        const db = userClient(bob.token);
        const { data, error } = await db.from('transactions').select('id').eq('id', aliceTxn.id);
        expect(error).toBeNull();
        expect(data).toEqual([]);

        const cats = await db.from('categories').select('id').eq('id', aliceCategory);
        expect(cats.data).toEqual([]);
      });

      it("rejects inserting a row owned by Alice", async () => {
        const { error } = await userClient(bob.token)
          .from('transactions')
          .insert({ user_id: alice.id, description: 'forged', amount: -1 });
        expect(error).not.toBeNull();
      });

      it("can't modify Alice's row even by id", async () => {
        const db = userClient(bob.token);
        await db.from('transactions').update({ amount: -1 }).eq('id', aliceTxn.id);
        await db.from('transactions').delete().eq('id', aliceTxn.id);

        const check = await as(alice).get('/api/transactions?month=2021-05');
        expect(check.body.items).toContainEqual(expect.objectContaining({ id: aliceTxn.id, amount: -999 }));
      });

      it('blocks the aggregation functions for logged-in users', async () => {
        const { error } = await userClient(bob.token).rpc('spending_by_month', {
          p_user_id: alice.id,
          p_start: '2021-01-01',
          p_end: '2022-01-01',
        });
        expect(error).not.toBeNull();
      });
    });
  });

  describe('demo login', () => {
    it('returns a working session with seeded data', async () => {
      const res = await request(app).post('/api/demo/session');
      expect(res.status).toBe(200);
      const demo = { token: res.body.access_token };

      const txns = await as(demo).get('/api/transactions?limit=100');
      expect(txns.body.items.length).toBeGreaterThan(50);
      const budgets = await as(demo).get('/api/budgets');
      expect(budgets.body.length).toBeGreaterThan(0);
    });
  });
});
