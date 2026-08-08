import { describe, it, expect } from 'vitest';
import {
  previewTrade,
  validateTrade,
  deriveBorrowAmount,
  divMod,
  deriveOperatorSecret,
  BASE_FEE_DIVISOR,
  PERFORMANCE_FEE_DIVISOR,
} from '../src/flash-loan.logic';

describe('fee model (mirrors executeFlashLoan)', () => {
  it('charges 0.1% base fee + 10% performance fee', () => {
    // borrow 10,000; buy 10 units @ 10, sell @ 12
    const p = previewTrade(10_000n, 10n, 12n, 100n);
    expect(p.buySpend).toBe(1_000n);
    expect(p.sellProceeds).toBe(1_200n);
    expect(p.profit).toBe(200n);
    expect(p.baseFee).toBe(10n); // 10000 / 1000
    expect(p.performanceFee).toBe(20n); // 200 / 10
    expect(p.fee).toBe(30n);
    expect(p.fee).toBe(10_000n / BASE_FEE_DIVISOR + p.profit / PERFORMANCE_FEE_DIVISOR);
  });

  it('floors the base fee on amounts under 1000', () => {
    const p = previewTrade(999n, 10n, 12n, 100n);
    expect(p.baseFee).toBe(0n);
  });

  it('floors the performance fee', () => {
    // profit = 25 → performance fee 2, not 2.5
    const p = previewTrade(10_000n, 10n, 11n, 25n);
    expect(p.profit).toBe(25n);
    expect(p.performanceFee).toBe(2n);
  });

  it('never yields a negative fee for profitable trades', () => {
    const p = previewTrade(10_000n, 10n, 11n, 100n);
    expect(p.fee).toBeGreaterThanOrEqual(0n);
    expect(p.fee).toBe(10n + 10n);
  });
});

describe('deriveBorrowAmount (qty × buyPrice)', () => {
  it('derives the loan amount from the trade', () => {
    expect(deriveBorrowAmount(12n, 8000n)).toBe(96_000n);
    expect(deriveBorrowAmount(100n, 10n)).toBe(1_000n);
  });

  it('is zero when qty or buyPrice is zero', () => {
    expect(deriveBorrowAmount(0n, 8000n)).toBe(0n);
    expect(deriveBorrowAmount(12n, 0n)).toBe(0n);
  });

  it('makes buySpend always equal borrowAmount (never exceeds it)', () => {
    for (const [buyPrice, qty] of [[10n, 100n], [8000n, 12n], [1n, 1n]] as const) {
      const borrow = deriveBorrowAmount(qty, buyPrice);
      expect(borrow).toBeGreaterThanOrEqual(0n);
      expect(previewTrade(borrow, buyPrice, 0n, qty).buySpend).toBe(borrow);
    }
  });
});

describe('divMod witness (mirrors the contract verifier)', () => {
  it('returns quotient and remainder for exact division', () => {
    expect(divMod(1000n, 10n)).toEqual([100n, 0n]);
  });

  it('returns quotient and remainder for inexact division', () => {
    expect(divMod(1023n, 10n)).toEqual([102n, 3n]);
  });

  it('always satisfies q * y + r == x', () => {
    for (const [x, y] of [[0n, 7n], [7n, 7n], [8n, 7n], [10_000_000n, 1000n]] as const) {
      const [q, r] = divMod(x, y);
      expect(q * y + r).toBe(x);
      expect(r).toBeGreaterThanOrEqual(0n);
      expect(r).toBeLessThan(y);
    }
  });
});

describe('validateTrade (mirrors executeFlashLoan assertions)', () => {
  // A trade that spends the full loan and turns it around profitably:
  // borrow 1,000, spend 1,000 (10 × 100), sell for 1,200 → profit 200,
  // fee = 1 + 20 = 21, proceeds 1,200 ≥ 1,000 + 21. Valid.
  const goodTrade = { buyPrice: 10n, sellPrice: 12n, qty: 100n };

  // toContain does exact-element matching, so compare against the joined
  // problem list to allow substring assertions.
  const problems = (borrowAmount: bigint, trade: { buyPrice: bigint; sellPrice: bigint; qty: bigint }) =>
    validateTrade(borrowAmount, trade).join('; ');

  it('accepts a profitable trade that covers principal + fee', () => {
    expect(validateTrade(1_000n, goodTrade)).toEqual([]);
  });

  it('rejects a non-positive borrow amount', () => {
    expect(problems(0n, goodTrade)).toContain('borrowAmount must be greater than zero');
  });

  it('rejects a non-positive buy price', () => {
    expect(problems(1_000n, { buyPrice: 0n, sellPrice: 12n, qty: 100n })).toContain(
      'buyPrice must be greater than zero',
    );
  });

  it('rejects a non-positive spread', () => {
    expect(problems(1_000n, { buyPrice: 12n, sellPrice: 12n, qty: 100n })).toContain(
      'sellPrice must be greater than buyPrice (positive spread)',
    );
  });

  it('rejects a non-positive quantity', () => {
    expect(problems(1_000n, { buyPrice: 10n, sellPrice: 12n, qty: 0n })).toContain(
      'qty must be greater than zero',
    );
  });

  it('rejects a trade spending more than borrowed', () => {
    // borrow only 500 but the trade spends 10 * 100 = 1000
    expect(problems(500n, goodTrade)).toContain('exceeds borrowAmount');
  });

  it('rejects a trade whose profit does not cover the fee', () => {
    // A breakeven trade (sellPrice == buyPrice) has profit 0, which cannot
    // cover the flat base fee of 1. (For any positive-profit trade the check
    // is implied by the other two asserts: proceeds >= borrow + fee and
    // buySpend <= borrow ⟹ profit >= fee. A useful teaching detail.)
    const breakeven = { buyPrice: 10n, sellPrice: 10n, qty: 100n };
    expect(problems(1_000n, breakeven)).toContain('does not cover the fee');
  });

  it('rejects a trade whose proceeds cannot repay principal + fee', () => {
    // borrow 1,000,000, sell proceeds 1,200 → base fee 1,000 → need 1,001,020
    const p = previewTrade(1_000_000n, 10n, 12n, 100n);
    expect(p.sellProceeds).toBeLessThan(1_000_000n + p.fee);
    expect(problems(1_000_000n, goodTrade)).toContain('cannot repay');
  });
});

describe('deriveOperatorSecret', () => {
  it('returns 32 bytes', () => {
    const secret = deriveOperatorSecret('test-seed');
    expect(secret).toHaveLength(32);
  });

  it('is deterministic for the same seed', () => {
    expect(deriveOperatorSecret('abc')).toEqual(deriveOperatorSecret('abc'));
  });

  it('differs across seeds', () => {
    expect(deriveOperatorSecret('abc')).not.toEqual(deriveOperatorSecret('abd'));
  });
});
