// Months are 'YYYY-MM' strings, matching the API's ?month= parameter.

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

export function formatMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return monthLabel.format(new Date(y, m - 1, 1));
}
