// A checking-account export in the style US banks use (MM/DD/YYYY dates,
// uppercase merchant names, negative spending), dated over the two weeks
// before today. The names don't exactly match the demo's history, so the AI
// categorizes them; repeats like the coffee shop share one answer.
const ROWS = [
  // [days ago, description, amount]
  [1, 'BLUE BOTTLE COFFEE #12', -5.25],
  [2, "TRADER JOE'S #552", -73.18],
  [3, 'HULU 877-8244858', -7.99],
  [4, 'CHEVRON 0091847', -44.6],
  [5, 'DOORDASH*SWEETGREEN', -18.4],
  [6, 'VENMO CASHOUT', 60],
  [7, 'BLUE BOTTLE COFFEE #12', -5.25],
  [8, 'CVS/PHARMACY #10432', -12.99],
  [9, 'AMAZON MKTPL*2K4L19', -26.47],
  [10, 'LYFT *RIDE TUE 8PM', -14.2],
  [11, 'APPLE.COM/BILL', -2.99],
  [12, 'COSTCO WHSE #0475', -131.06],
  [13, 'AMC THEATRES 2201', -19.5],
  [14, 'BLUE BOTTLE COFFEE #12', -4.75],
];

const pad = (n) => String(n).padStart(2, '0');

export function sampleBankCsv(today = new Date()) {
  const lines = ROWS.map(([daysAgo, description, amount]) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
    const date = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    return `${date},"${description}",${amount.toFixed(2)}`;
  });
  return ['Posting Date,Description,Amount', ...lines].join('\n');
}
