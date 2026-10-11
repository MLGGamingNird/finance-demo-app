import { useState } from 'react';
import { ApiError } from '../lib/api';
import { todayISO } from '../lib/format';

const AUTO = 'auto';

function FieldError({ errors }) {
  return errors?.length ? <span className="field-error">{errors[0]}</span> : null;
}

// Used for both adding and editing. `transaction` is the row being edited,
// or null when adding. The parent remounts this with a new key to reset it.
export function TransactionForm({ categories, transaction, onSubmit, onCancel }) {
  const editing = Boolean(transaction);
  const [type, setType] = useState(transaction && Number(transaction.amount) > 0 ? 'income' : 'expense');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [amount, setAmount] = useState(transaction ? String(Math.abs(Number(transaction.amount))) : '');
  // New transactions default to letting the server pick a category.
  const [categoryId, setCategoryId] = useState(transaction ? (transaction.category_id ?? '') : AUTO);
  const [date, setDate] = useState(transaction?.occurred_at ?? todayISO());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const categoryOptions = categories.filter((c) => c.kind === type);

  function changeType(next) {
    setType(next);
    // Drop a category that belongs to the other side.
    if (categoryId !== AUTO && !categories.some((c) => c.id === categoryId && c.kind === next)) setCategoryId('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    const magnitude = Math.abs(Number(amount));
    try {
      await onSubmit({
        description,
        amount: type === 'expense' ? -magnitude : magnitude,
        // Omitting category_id asks the server to auto-categorize.
        ...(categoryId !== AUTO && { category_id: categoryId || null }),
        occurred_at: date,
      });
      if (!editing) {
        setDescription('');
        setAmount('');
        setCategoryId(AUTO);
      }
    } catch (err) {
      setError(err.message);
      if (err instanceof ApiError) setFieldErrors(err.fields);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`transaction-form${editing ? ' editing' : ''}`}>
      {editing && <p className="form-title">Editing “{transaction.description}”</p>}

      <div className="type-toggle" role="radiogroup" aria-label="Transaction type">
        {['expense', 'income'].map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            className={type === t ? `active ${t}` : ''}
            onClick={() => changeType(t)}
          >
            {t === 'expense' ? 'Expense' : 'Income'}
          </button>
        ))}
      </div>

      <div className="form-row">
        <label className="grow">
          <span className="sr-only">Description</span>
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={100}
            required
          />
          <FieldError errors={fieldErrors.description} />
        </label>
        <label className="amount">
          <span className="sr-only">Amount</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <FieldError errors={fieldErrors.amount} />
        </label>
      </div>

      <div className="form-row">
        <label className="grow">
          <span className="sr-only">Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {!editing && <option value={AUTO}>✨ Auto-categorize</option>}
            <option value="">No category</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldError errors={fieldErrors.category_id} />
        </label>
        <label>
          <span className="sr-only">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <FieldError errors={fieldErrors.occurred_at} />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : editing ? 'Save' : 'Add'}
        </button>
        {editing && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </form>
  );
}
