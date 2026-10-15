import { describe, expect, it, vi } from 'vitest';
import { monthRange, monthSchema, shiftMonth } from '../src/lib/month.js';
import { fromCents, toCents } from '../src/lib/money.js';
import { rateLimit } from '../src/lib/rateLimit.js';
import { afterCursorFilter, decodeCursor, encodeCursor } from '../src/lib/pagination.js';

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
