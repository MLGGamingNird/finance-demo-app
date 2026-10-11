import { currentMonth, formatMonth, shiftMonth } from '../lib/month';

export function MonthPicker({ month, onChange }) {
  const isCurrent = month >= currentMonth();

  return (
    <div className="month-picker">
      <button type="button" className="icon" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        ‹
      </button>
      <span className="month-label">{formatMonth(month)}</span>
      <button
        type="button"
        className="icon"
        aria-label="Next month"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrent}
      >
        ›
      </button>
      {!isCurrent && (
        <button type="button" className="link" onClick={() => onChange(currentMonth())}>
          This month
        </button>
      )}
    </div>
  );
}
