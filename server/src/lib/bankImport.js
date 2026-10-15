import { createHash } from 'node:crypto';
import { parseCsv } from './csv.js';
import { fromCents } from './money.js';

export const MAX_IMPORT_ROWS = 2000;
const MAX_DESCRIPTION = 100;

// Header names banks commonly use, lowercased. The first match wins.
const HEADER_ALIASES = {
  date: ['date', 'transaction date', 'trans. date', 'trans date', 'posted date', 'posting date', 'post date'],
  description: ['description', 'payee', 'merchant', 'name', 'details', 'transaction description', 'memo'],
  amount: ['amount', 'transaction amount', 'amount (usd)'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'money out', 'debit amount'],
  credit: ['credit', 'deposit', 'deposits', 'money in', 'credit amount'],
};

// Picks columns from the header row. Returns indexes, with -1 for missing.
export function detectColumns(header) {
  const names = header.map((h) => h.trim().toLowerCase());
  const find = (aliases) => {
    for (const alias of aliases) {
      const i = names.indexOf(alias);
      if (i !== -1) return i;
    }
    return -1;
  };
  return Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, find(aliases)]));
}

// "$1,234.56", "-12.00", "(12.00)" and "12.00-" all parse, to integer cents.
// Returns null for anything else, including blanks.
export function parseAmountCents(text) {
  let s = text.trim().replace(/[$€£,\s]/g, '').replace(/^(USD|EUR|GBP)/i, '');
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, fraction = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

const pad = (n) => String(n).padStart(2, '0');

function validDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

// Slash dates are ambiguous (03/04 is March 4 in the US, 3 April elsewhere).
// Look at the whole column: a first part over 12 means day first.
export function detectDayFirst(values) {
  let dayFirst = false;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m && Number(m[1]) > 12) dayFirst = true;
    if (m && Number(m[2]) > 12) return false;
  }
  return dayFirst;
}

// Returns YYYY-MM-DD, or null if the text isn't a real calendar date.
export function parseDate(text, { dayFirst = false } = {}) {
  const s = text.trim();
  let year;
  let month;
  let day;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    [month, day] = dayFirst ? [b, a] : [a, b];
    year = Number(m[3]);
    if (m[3].length === 2) year += 2000;
    else if (m[3].length !== 4) return null;
  } else {
    return null;
  }
  return validDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
}

const normalizeDescription = (text) => text.trim().replace(/\s+/g, ' ').slice(0, MAX_DESCRIPTION);

// A stable key per row, so importing the same file (or an overlapping
// export) twice skips rows that are already there. Identical rows within one
// file, like two $5 coffees on the same day, are told apart by how many came
// before them.
function importHash(row, occurrence) {
  return createHash('sha256')
    .update(`${row.occurred_at}|${row.cents}|${row.description.toLowerCase()}|${occurrence}`)
    .digest('hex')
    .slice(0, 32);
}

// The header travels with the error so the client can offer column choices.
export class ImportError extends Error {
  constructor(message, header = null) {
    super(message);
    this.header = header;
  }
}

// Turns bank CSV text into transaction rows. `columns` overrides detection;
// `flipSigns` is for banks that list spending as positive numbers.
// Rows that can't be read are reported in `errors` rather than failing the import.
export function readBankCsv(text, { columns: chosen, flipSigns = false } = {}) {
  const table = parseCsv(text);
  if (table.length < 2) throw new ImportError('The file needs a header row and at least one transaction.');
  const [header, ...body] = table;
  if (body.length > MAX_IMPORT_ROWS) {
    throw new ImportError(`The file has ${body.length} rows; the limit is ${MAX_IMPORT_ROWS} per import.`);
  }

  const columns = { ...detectColumns(header), ...chosen };
  const hasAmount = columns.amount >= 0 || columns.debit >= 0 || columns.credit >= 0;
  if (columns.date < 0 || columns.description < 0 || !hasAmount) {
    throw new ImportError(
      "Couldn't find the date, description and amount columns. Pick them below.",
      header.map((h) => h.trim()),
    );
  }

  const cell = (record, index) => (index >= 0 ? (record[index] ?? '') : '');
  const dayFirst = detectDayFirst(body.map((r) => cell(r, columns.date)));
  const rows = [];
  const errors = [];
  const seen = new Map();

  body.forEach((record, i) => {
    const line = i + 2;
    const occurred_at = parseDate(cell(record, columns.date), { dayFirst });
    const description = normalizeDescription(cell(record, columns.description));

    let cents;
    if (columns.amount >= 0) {
      cents = parseAmountCents(cell(record, columns.amount));
    } else {
      // Separate columns: debits are money out whatever their sign.
      const debit = parseAmountCents(cell(record, columns.debit));
      const credit = parseAmountCents(cell(record, columns.credit));
      cents = debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (cents !== null && flipSigns) cents = -cents;

    if (!occurred_at) return errors.push({ line, message: 'Unreadable date' });
    if (!description) return errors.push({ line, message: 'Missing description' });
    if (cents === null) return errors.push({ line, message: 'Unreadable amount' });
    if (cents === 0) return errors.push({ line, message: 'Zero amount' });
    if (Math.abs(cents) >= 100_000_000_000) return errors.push({ line, message: 'Amount is too large' });

    const row = { occurred_at, description, cents };
    const key = `${occurred_at}|${cents}|${description.toLowerCase()}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    rows.push({ occurred_at, description, amount: fromCents(cents), import_hash: importHash(row, occurrence) });
  });

  // Most statement rows are spending, so mostly-positive amounts suggest the
  // bank writes spending as positive numbers.
  const positives = rows.filter((r) => r.amount > 0).length;
  const suggestFlip = !flipSigns && rows.length >= 3 && positives / rows.length > 0.7;

  return { header: header.map((h) => h.trim()), columns, rows, errors, suggestFlip };
}
