const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatCurrency(amount) {
  return currency.format(Number(amount));
}

export function formatAmount(amount) {
  const n = Number(amount);
  return `${n > 0 ? '+' : '−'}${currency.format(Math.abs(n))}`;
}

// Dates are stored as YYYY-MM-DD; parse them as local dates so they
// don't shift a day in timezones west of UTC.
export function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return shortDate.format(new Date(y, m - 1, d));
}

export function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
