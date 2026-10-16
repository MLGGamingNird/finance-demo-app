import { formatCurrency, formatDate } from '../lib/format';

// Each row says why it was flagged, so a false positive is easy to spot and
// rent showing up next to Netflix reads as intended.
export function RecurringCharges({ recurring, categories }) {
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  if (!recurring) return null;
  const { items, monthly_total } = recurring;
  const subscriptionsCents = items
    .filter((r) => categoryNames.get(r.category_id) === 'Subscriptions')
    .reduce((sum, r) => sum + Math.round(r.monthly_amount * 100), 0);

  return (
    <section className="recurring">
      <div className="section-header">
        <h2>Recurring charges</h2>
        {items.length > 0 && <span className="recurring-total">{formatCurrency(monthly_total)} a month</span>}
      </div>

      {items.length === 0 ? (
        <p className="empty">Nothing recurring yet. A charge shows up here after three payments on a regular schedule.</p>
      ) : (
        <>
          {subscriptionsCents > 0 && (
            <p className="hint">Subscriptions alone come to {formatCurrency(subscriptionsCents / 100)} a month.</p>
          )}
          <ul className="transaction-list recurring-list">
            {items.map((r) => (
              <li key={r.merchant}>
                <div className="details">
                  <span className="description">{r.description}</span>
                  <span className="meta">
                    {categoryNames.get(r.category_id) ?? 'Uncategorized'} · {r.cadence} · next around{' '}
                    {formatDate(r.next_date)}
                  </span>
                  <span className="why">
                    {r.charge_count} charges since {formatDate(r.first_date)},{' '}
                    {r.same_amount ? 'same amount each time' : 'similar amounts'}
                  </span>
                </div>
                <span className="amount expense">{formatCurrency(r.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
