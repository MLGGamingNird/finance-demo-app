import { fromCents, toCents } from './money.js';
import { shiftMonth } from './month.js';

// The savings pace is the average monthly net (income minus spending) over
// the last few complete months. The current month is left out, since a
// half-finished month always looks like great saving or none at all.
export const PACE_MONTHS = 3;

const monthIndex = (month) => {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + m;
};

// monthTotals: [{ month, incomeCents, expenseCents }] for months with any
// activity. Returns average net cents per month, or null with no history.
export function savingsPace(monthTotals) {
  if (monthTotals.length === 0) return null;
  const net = monthTotals.reduce((sum, m) => sum + m.incomeCents - m.expenseCents, 0);
  return Math.round(net / monthTotals.length);
}

// Adds what a goal's progress means: what's left, when the recent pace would
// get there, and what it would take to make the target date.
export function projectGoal(goal, paceCents, currentMonth) {
  const remainingCents = Math.max(toCents(goal.target_amount) - toCents(goal.saved_amount), 0);
  const targetMonth = goal.target_date ? goal.target_date.slice(0, 7) : null;

  if (remainingCents === 0) {
    return { ...goal, remaining: 0, reached: true, projected_month: null, needed_per_month: null, on_track: true };
  }

  const projectedMonth = paceCents > 0 ? shiftMonth(currentMonth, Math.ceil(remainingCents / paceCents)) : null;
  // A target this month (or already past) leaves one month to save in.
  const monthsLeft = targetMonth ? Math.max(monthIndex(targetMonth) - monthIndex(currentMonth), 1) : null;

  return {
    ...goal,
    remaining: fromCents(remainingCents),
    reached: false,
    projected_month: projectedMonth,
    needed_per_month: monthsLeft ? fromCents(Math.ceil(remainingCents / monthsLeft)) : null,
    on_track: targetMonth ? projectedMonth !== null && projectedMonth <= targetMonth : null,
  };
}
