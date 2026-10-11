import { useState } from 'react';
import { formatAmount, formatDate } from '../lib/format';

export function TransactionList({ transactions, categories, loading, emptyMessage, editingId, onEdit, onDelete }) {
  // Delete takes two clicks: the first arms it, the second confirms.
  const [confirmingId, setConfirmingId] = useState(null);
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  if (loading) return <p className="empty">Loading…</p>;
  if (transactions.length === 0) return <p className="empty">{emptyMessage}</p>;

  return (
    <ul className="transaction-list">
      {transactions.map((t) => (
        <li key={t.id} className={t.id === editingId ? 'editing' : ''}>
          <div className="details">
            <span className="description">{t.description}</span>
            <span className="meta">
              {categoryNames.get(t.category_id) ?? 'Uncategorized'}
              {t.auto_categorized && (
                <span className="auto-badge" title="Category picked automatically. Edit to change it.">
                  auto
                </span>
              )}{' '}
              · {formatDate(t.occurred_at)}
            </span>
          </div>
          <span className={`amount ${Number(t.amount) > 0 ? 'income' : 'expense'}`}>
            {formatAmount(t.amount)}
          </span>
          <div className="row-actions">
            <button type="button" className="link" onClick={() => onEdit(t)}>
              Edit
            </button>
            <button
              type="button"
              className={`link${confirmingId === t.id ? ' danger' : ''}`}
              onClick={() => {
                if (confirmingId === t.id) {
                  setConfirmingId(null);
                  onDelete(t);
                } else {
                  setConfirmingId(t.id);
                }
              }}
              onBlur={() => setConfirmingId(null)}
            >
              {confirmingId === t.id ? 'Confirm?' : 'Delete'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
