import { describe, expect, it, vi } from 'vitest';
import { monthRange, monthSchema, shiftMonth } from '../src/lib/month.js';
import { fromCents, toCents } from '../src/lib/money.js';
import { rateLimit } from '../src/lib/rateLimit.js';
import { afterCursorFilter, decodeCursor, encodeCursor } from '../src/lib/pagination.js';
import { parseCsv } from '../src/lib/csv.js';
import { ImportError, detectColumns, detectDayFirst, parseAmountCents, parseDate, readBankCsv } from '../src/lib/bankImport.js';

describe('month helpers', () => {
  it('returns a half-open range for a month', () => {
    expect(monthRange('2026-02')).toEqual(['2026-02-01', '2026-03-01']);
  });

  it('rolls December over into the next year', () => {
    expect(monthRange('2026-12')).toEqual(['2026-12-01', '2027-01-01']);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', -5)).toBe('2026-05');
  });

  it('only accepts YYYY-MM', () => {
    expect(monthSchema.safeParse('2026-10').success).toBe(true);
    for (const bad of ['2026-13', '2026-1', '10-2026', '2026-00', '']) {
      expect(monthSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('money helpers', () => {
  it('sums in cents without float drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(fromCents(toCents(0.1) + toCents(0.2))).toBe(0.3);
    expect(fromCents(toCents('2850') - toCents('1839.58'))).toBe(1010.42);
  });
});

describe('rateLimit', () => {
  function run(limiter, key = 'a') {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), set: vi.fn() };
    const next = vi.fn();
    limiter({ key }, res, next);
    return { res, next };
  }

  it('allows up to the limit per key, then returns 429 with Retry-After', () => {
    const limiter = rateLimit({ limit: 2, windowMs: 60_000, key: (req) => req.key });

    expect(run(limiter).next).toHaveBeenCalled();
    expect(run(limiter).next).toHaveBeenCalled();
    const blocked = run(limiter);
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.status).toHaveBeenCalledWith(429);
    expect(blocked.res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));

    // Other keys have their own budget.
    expect(run(limiter, 'b').next).toHaveBeenCalled();
  });

  it('allows requests again once the window has passed', () => {
    vi.useFakeTimers();
    try {
      const limiter = rateLimit({ limit: 1, windowMs: 1000, key: (req) => req.key });
      expect(run(limiter).next).toHaveBeenCalled();
      expect(run(limiter).next).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1001);
      expect(run(limiter).next).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pagination cursors', () => {
  const row = {
    occurred_at: '2026-10-03',
    created_at: '2026-10-03T14:05:06.123456+00:00',
    id: '0b6c3c1e-8f4a-4b7e-9a51-2d5f1c7e8a90',
  };

  it("round-trips a row's sort key", () => {
    expect(decodeCursor(encodeCursor(row))).toEqual([row.occurred_at, row.created_at, row.id]);
  });

  it('rejects anything it did not produce', () => {
    const forged = Buffer.from(JSON.stringify(['2026-10-03', '2026-10-03"),id.gt.(0', row.id])).toString('base64url');
    for (const bad of ['', 'not-a-cursor', forged, Buffer.from('{"a":1}').toString('base64url')]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });

  it('builds a filter for rows after the cursor', () => {
    expect(afterCursorFilter(decodeCursor(encodeCursor(row)))).toBe(
      'occurred_at.lt.2026-10-03,' +
        'and(occurred_at.eq.2026-10-03,created_at.lt."2026-10-03T14:05:06.123456+00:00"),' +
        'and(occurred_at.eq.2026-10-03,created_at.eq."2026-10-03T14:05:06.123456+00:00",id.lt.0b6c3c1e-8f4a-4b7e-9a51-2d5f1c7e8a90)',
    );
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, line breaks in fields and CRLF', () => {
    const text = '﻿Date,Description,Amount\r\n2026-10-01,"Joe\'s ""Diner"", Inc",-12.50\r\n\r\n2026-10-02,"Line\nbreak",3\n';
    expect(parseCsv(text)).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-10-01', 'Joe\'s "Diner", Inc', '-12.50'],
      ['2026-10-02', 'Line\nbreak', '3'],
    ]);
  });
});

describe('bank CSV import', () => {
  it('parses amounts in the formats banks use, to cents', () => {
    expect(parseAmountCents('$1,234.56')).toBe(123456);
    expect(parseAmountCents('-12.5')).toBe(-1250);
    expect(parseAmountCents('(12.00)')).toBe(-1200);
    expect(parseAmountCents('12.00-')).toBe(-1200);
    expect(parseAmountCents('+7')).toBe(700);
    expect(parseAmountCents('0.1')).toBe(10);
    for (const bad of ['', 'abc', '1.234', '12,34.5.6']) expect(parseAmountCents(bad)).toBeNull();
  });

  it('parses dates and works out day-first files from the whole column', () => {
    expect(parseDate('2026-10-03')).toBe('2026-10-03');
    expect(parseDate('10/03/2026')).toBe('2026-10-03');
    expect(parseDate('3/4/26')).toBe('2026-03-04');
    expect(parseDate('03/04/2026', { dayFirst: true })).toBe('2026-04-03');
    expect(parseDate('02/30/2026')).toBeNull();
    expect(parseDate('yesterday')).toBeNull();
    expect(detectDayFirst(['03/04/2026', '25/04/2026'])).toBe(true);
    expect(detectDayFirst(['03/04/2026', '04/25/2026'])).toBe(false);
  });

  it('detects common column names', () => {
    expect(detectColumns(['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount', 'Memo'])).toMatchObject({
      date: 0,
      description: 2,
      amount: 5,
    });
    expect(detectColumns(['Date', 'Payee', 'Debit', 'Credit'])).toMatchObject({ description: 1, amount: -1, debit: 2, credit: 3 });
  });

  it('reads rows, reports bad ones, and keys identical rows apart', () => {
    const csv = [
      'Date,Description,Amount',
      '10/01/2026,Coffee,-5.00',
      '10/01/2026,Coffee,-5.00',
      '10/02/2026,  Paycheck   deposit ,2850',
      'not a date,Thing,-1',
      '10/03/2026,Nothing,0',
    ].join('\n');
    const { rows, errors } = readBankCsv(csv);
    expect(rows.map((r) => [r.occurred_at, r.description, r.amount])).toEqual([
      ['2026-10-01', 'Coffee', -5],
      ['2026-10-01', 'Coffee', -5],
      ['2026-10-02', 'Paycheck deposit', 2850],
    ]);
    expect(rows[0].import_hash).not.toBe(rows[1].import_hash);
    expect(readBankCsv(csv).rows.map((r) => r.import_hash)).toEqual(rows.map((r) => r.import_hash));
    expect(errors).toEqual([
      { line: 5, message: 'Unreadable date' },
      { line: 6, message: 'Zero amount' },
    ]);
  });

  it('combines debit and credit columns and can flip signs', () => {
    const csv = 'Date,Payee,Debit,Credit\n2026-10-01,Rent,1450.00,\n2026-10-02,Refund,,20.00\n';
    expect(readBankCsv(csv).rows.map((r) => r.amount)).toEqual([-1450, 20]);

    const positive = 'Date,Description,Amount\n2026-10-01,A,5\n2026-10-02,B,6\n2026-10-03,C,7\n2026-10-04,Pay,-100\n';
    expect(readBankCsv(positive).suggestFlip).toBe(true);
    expect(readBankCsv(positive, { flipSigns: true }).rows.map((r) => r.amount)).toEqual([-5, -6, -7, 100]);
  });

  it('asks for columns it cannot find, with the header to choose from', () => {
    const csv = 'When,What,How much\n2026-10-01,Coffee,-5\n';
    expect(() => readBankCsv(csv)).toThrow(ImportError);
    try {
      readBankCsv(csv);
    } catch (err) {
      expect(err.header).toEqual(['When', 'What', 'How much']);
    }
    const chosen = readBankCsv(csv, { columns: { date: 0, description: 1, amount: 2, debit: -1, credit: -1 } });
    expect(chosen.rows).toHaveLength(1);
  });
});
