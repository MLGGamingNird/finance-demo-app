import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { formatMonth } from '../lib/month';

const toCents = (amount) => Math.round(Number(amount) * 100);

function projection(goal, pace) {
  if (goal.reached) return 'Goal reached.';
  const target = goal.target_date && formatMonth(goal.target_date.slice(0, 7));
  const projected = goal.projected_month && formatMonth(goal.projected_month);

  if (target) {
    if (goal.on_track) return `On track for ${target}. That takes about ${formatCurrency(goal.needed_per_month)} a month.`;
    const pacePart = projected ? ` At your recent pace you'd get there in ${projected}.` : '';
    return `Needs about ${formatCurrency(goal.needed_per_month)} a month to make ${target}.${pacePart}`;
  }
  if (projected) return `At your recent pace, around ${projected}.`;
  if (pace === null) return 'Not enough history yet to project a date.';
  return "Recent months spent more than came in, so there's no date yet.";
}

function GoalRow({ goal, pace, token, onChange }) {
  const [adding, setAdding] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ratio = Math.min(goal.saved_amount / goal.target_amount, 1);

  async function run(request) {
    setBusy(true);
    setError(null);
    try {
      await request();
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function addMoney(e) {
    e.preventDefault();
    const saved = (toCents(goal.saved_amount) + toCents(adding)) / 100;
    run(async () => {
      await apiFetch(`/api/goals/${goal.id}`, { token, method: 'PATCH', body: { saved_amount: saved } });
      setAdding('');
    });
  }

  return (
    <li>
      <div className="budget-line">
        <span>{goal.name}</span>
        <span className="budget-numbers">
          {formatCurrency(goal.saved_amount)} of {formatCurrency(goal.target_amount)}
        </span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label={`${goal.name} saved`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div className="progress-fill ok" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className={`goal-projection${goal.on_track === false ? ' behind' : ''}`}>{projection(goal, pace)}</p>
      <div className="goal-actions">
        {!goal.reached && (
          <form onSubmit={addMoney} className="goal-add">
            <label>
              <span className="sr-only">Amount to add to {goal.name}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="Amount"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="secondary" disabled={busy}>
              Add money
            </button>
          </form>
        )}
        <button
          type="button"
          className={`link${confirmingDelete ? ' danger' : ''}`}
          disabled={busy}
          onClick={() =>
            confirmingDelete
              ? run(() => apiFetch(`/api/goals/${goal.id}`, { token, method: 'DELETE' }))
              : setConfirmingDelete(true)
          }
          onBlur={() => setConfirmingDelete(false)}
        >
          {confirmingDelete ? 'Confirm delete' : 'Delete'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  );
}

function NewGoalForm({ token, onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/goals', {
        token,
        method: 'POST',
        body: { name, target_amount: Number(target), target_date: date || null },
      });
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="transaction-form">
      <div className="form-row">
        <label className="grow">
          <span className="sr-only">Goal name</span>
          <input placeholder="What are you saving for?" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <label className="amount">
          <span className="sr-only">Target amount</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="Target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
        </label>
      </div>
      <div className="form-row">
        <label className="grow">
          <span className="hint">Target date (optional)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add goal'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SavingsGoals({ data, token, onChange }) {
  const [creating, setCreating] = useState(false);
  const pace = data?.monthly_pace ?? null;

  return (
    <section className="goals">
      <div className="section-header">
        <h2>Savings goals</h2>
        {!creating && (
          <button type="button" className="link" onClick={() => setCreating(true)}>
            New goal
          </button>
        )}
      </div>

      {creating && (
        <NewGoalForm
          token={token}
          onCreated={() => {
            setCreating(false);
            onChange();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {!data ? (
        <p className="empty">Loading…</p>
      ) : data.goals.length === 0 ? (
        !creating && <p className="empty">No goals yet. Add one to see when you'd reach it at your current pace.</p>
      ) : (
        <>
          <ul className="budget-list goal-list">
            {data.goals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} pace={pace} token={token} onChange={onChange} />
            ))}
          </ul>
          {pace !== null && (
            <p className="hint">
              Dates assume your average monthly savings over the last three full months ({formatCurrency(pace)}) all go
              to that goal.
            </p>
          )}
        </>
      )}
    </section>
  );
}
