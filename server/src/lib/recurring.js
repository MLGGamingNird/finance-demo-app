import { fromCents, toCents } from './money.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// How far back to look for repeating charges: enough for several monthly ones.
export const RECURRING_LOOKBACK_DAYS = 200;

// Gaps between charges, in days, that count as each cadence. Monthly allows
// for short months and charges that land a few days early or late.
const CADENCES = [
  { name: 'weekly', min: 6, max: 8, days: 7, perMonth: 52 / 12 },
  { name: 'every two weeks', min: 12, max: 16, days: 14, perMonth: 26 / 12 },
  { name: 'monthly', min: 26, max: 35, days: 30, perMonth: 1 },
];

// Most gaps must fit the cadence: one skipped or late charge is fine, a
// shop you visit now and then is not.
const REGULAR_SHARE = 0.8;
// Amounts within this of the typical charge count as the same bill.
const AMOUNT_TOLERANCE = 0.25;

const toDay = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
const toIso = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function nextMonthlyDate(lastIso) {
  const [y, m, d] = lastIso.split('-').map(Number);
  // Clamp to the month's last day, so a charge on the 31st comes back on the 30th.
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

// Picks out charges that repeat on a regular schedule at a steady amount and
// are still happening. Each result says why it was flagged, so a reader can
// judge it: rent is recurring too, and that's worth seeing.
export function detectRecurring(candidates, today) {
  const todayDay = toDay(today);
  const found = [];

  for (const c of candidates) {
    const days = c.dates.map(toDay);
    const gaps = days.slice(1).map((day, i) => day - days.at(i));
    if (gaps.length < 2) continue;

    const typicalGap = median(gaps);
    const cadence = CADENCES.find((k) => typicalGap >= k.min && typicalGap <= k.max);
    if (!cadence) continue;
    const regular = gaps.filter((g) => g >= cadence.min && g <= cadence.max).length;
    if (regular / gaps.length < REGULAR_SHARE) continue;

    const cents = c.amounts.map(toCents);
    const typicalCents = Math.round(median(cents));
    const steady = cents.filter((v) => Math.abs(v - typicalCents) <= typicalCents * AMOUNT_TOLERANCE).length;
    if (steady / cents.length < REGULAR_SHARE) continue;

    // Stopped charges (a cancelled subscription) drop off the list.
    const last = c.dates.at(-1);
    if (todayDay - toDay(last) > cadence.max * 1.5) continue;

    const sameAmount = cents.every((v) => v === typicalCents);
    found.push({
      merchant: c.merchant,
      description: c.description,
      category_id: c.category_id,
      cadence: cadence.name,
      amount: fromCents(typicalCents),
      monthly_amount: fromCents(Math.round(typicalCents * cadence.perMonth)),
      last_date: last,
      next_date: cadence.name === 'monthly' ? nextMonthlyDate(last) : toIso(toDay(last) + cadence.days),
      charge_count: c.dates.length,
      first_date: c.dates[0],
      same_amount: sameAmount,
    });
  }

  return found.sort((a, b) => b.monthly_amount - a.monthly_amount);
}
