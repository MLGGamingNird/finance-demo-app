import { z } from 'zod';

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');

// Returns [first day of month, first day of next month] as YYYY-MM-DD,
// for a half-open range query on a date column.
export function monthRange(month) {
  const [year, m] = month.split('-').map(Number);
  const next = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
