// Totals are summed in integer cents so float error can't creep in.
export const toCents = (amount) => Math.round(Number(amount) * 100);
export const fromCents = (cents) => cents / 100;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatUsd = (amount) => usd.format(amount);
