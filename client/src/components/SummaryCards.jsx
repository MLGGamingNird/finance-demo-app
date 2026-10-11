import { formatCurrency } from '../lib/format';

export function SummaryCards({ summary }) {
  const cards = [
    { label: 'Income', value: summary?.income, className: 'income' },
    { label: 'Spending', value: summary?.expenses, className: 'expense' },
    { label: 'Net', value: summary?.net, className: summary && summary.net < 0 ? 'expense' : 'income' },
  ];

  return (
    <div className="summary-cards">
      {cards.map(({ label, value, className }) => (
        <div key={label} className="card">
          <span className="card-label">{label}</span>
          <span className={`card-value ${className}`}>{value === undefined ? '—' : formatCurrency(value)}</span>
        </div>
      ))}
    </div>
  );
}
