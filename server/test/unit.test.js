import { describe, expect, it, vi } from 'vitest';
import { monthRange, monthSchema, shiftMonth } from '../src/lib/month.js';
import { fromCents, toCents } from '../src/lib/money.js';
import { rateLimit } from '../src/lib/rateLimit.js';

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
