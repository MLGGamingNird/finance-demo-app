import { useState } from 'react';
import { formatCurrency } from '../lib/format';

function budgetStatus(ratio) {
  if (ratio > 1) return 'over';
  if (ratio >= 0.8) return 'near';
  return 'ok';
}

function BudgetEditor({ expenseCategories, budgetByCategory, onSave, onCancel }) {
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(expenseCategories.map((c) => [c.id, budgetByCategory.get(c.id)?.toString() ?? ''])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Only send categories whose value actually changed; blank clears it.
    const changes = expenseCategories
      .map((c) => {
        const draft = drafts[c.id].trim();
        const next = draft === '' ? null : Number(draft);
        return { categoryId: c.id, amount: next, previous: budgetByCategory.get(c.id) ?? null };
      })
      .filter(({ amount, previous }) => amount !== previous);

    try {
      await onSave(changes);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="budget-editor">
      <p className="hint">Monthly limit per category. Leave blank for no budget.</p>
      {expenseCategories.map((c) => (
        <label key={c.id} className="budget-edit-row">
          <span>{c.name}</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="No budget"
            value={drafts[c.id]}
            onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
          />
        </label>
      ))}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save budgets'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function BudgetList({ categories, budgets, summary, onSave }) {
  const [editing, setEditing] = useState(false);

  const expenseCategories = categories.filter((c) => c.kind === 'expense');
  const budgetByCategory = new Map(budgets.map((b) => [b.category_id, Number(b.amount)]));
  const spentByCategory = new Map((summary?.spending_by_category ?? []).map((s) => [s.category_id, s.spent]));

  const rows = expenseCategories
    .filter((c) => budgetByCategory.has(c.id))
    .map((c) => {
      const limit = budgetByCategory.get(c.id);
      const spent = spentByCategory.get(c.id) ?? 0;
      return { id: c.id, name: c.name, limit, spent, ratio: spent / limit };
    })
    .sort((a, b) => b.ratio - a.ratio);

  async function handleSave(changes) {
    await onSave(changes);
    setEditing(false);
  }

  return (
    <section className="budgets">
      <div className="section-header">
        <h2>Budgets</h2>
        {!editing && (
          <button type="button" className="link" onClick={() => setEditing(true)}>
            {rows.length ? 'Edit budgets' : 'Set budgets'}
          </button>
        )}
      </div>

      {editing ? (
        <BudgetEditor
          expenseCategories={expenseCategories}
          budgetByCategory={budgetByCategory}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : !summary ? (
        <p className="empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No budgets yet. Set a monthly limit to track spending by category.</p>
      ) : (
        <ul className="budget-list">
          {rows.map((row) => {
            const status = budgetStatus(row.ratio);
            return (
              <li key={row.id}>
                <div className="budget-line">
                  <span>{row.name}</span>
                  <span className={`budget-numbers ${status}`}>
                    {formatCurrency(row.spent)} of {formatCurrency(row.limit)}
                    {status === 'over' && ` · ${formatCurrency(row.spent - row.limit)} over`}
                  </span>
                </div>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`${row.name} budget used`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(row.ratio, 1) * 100)}
                >
                  <div className={`progress-fill ${status}`} style={{ width: `${Math.min(row.ratio, 1) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
