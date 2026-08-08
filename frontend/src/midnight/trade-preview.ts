/**
 * Pure arithmetic that mirrors the flash-loan contract's fee model and its
 * on-chain assertions (contracts/flash-loan.compact). The browser cannot import
 * the backend's src/flash-loan.logic.ts because that module depends on Node's
 * node:crypto — so the pure preview/validation logic is duplicated here.
 *
 * These functions run entirely in the browser; the values feed the `getTrade`
 * witness and are never written to the ledger.
 */

import type { Trade, TradePreview } from './types';

export type { Trade, TradePreview };

export const BASE_FEE_DIVISOR = 1000n; // 0.1% of borrowAmount
export const PERFORMANCE_FEE_DIVISOR = 10n; // 10% of profit

// The loan amount is derived from the trade itself: you borrow exactly what
// your position costs (qty × buyPrice). Deriving it — instead of accepting an
// unrelated number — structurally guarantees the contract's
// `buySpend <= borrowAmount` assertion can never fail, and avoids borrowing
// capital that cannot be deployed (which would only inflate the 0.1% base fee).
export function deriveBorrowAmount(qty: bigint, buyPrice: bigint): bigint {
  return qty * buyPrice;
}

// fee = borrowAmount/1000 + profit/10, mirroring executeFlashLoan.
export function previewTrade(
  borrowAmount: bigint,
  buyPrice: bigint,
  sellPrice: bigint,
  qty: bigint,
): TradePreview {
  const buySpend = buyPrice * qty;
  const sellProceeds = sellPrice * qty;
  const profit = sellProceeds - buySpend;
  const baseFee = borrowAmount / BASE_FEE_DIVISOR;
  const performanceFee = profit / PERFORMANCE_FEE_DIVISOR;
  const fee = baseFee + performanceFee;
  return { buySpend, sellProceeds, profit, baseFee, performanceFee, fee };
}

// Mirrors the assertion set of executeFlashLoan (in the same order).
export function validateTrade(borrowAmount: bigint, trade: Trade): string[] {
  const { buyPrice, sellPrice, qty } = trade;
  const problems: string[] = [];

  if (borrowAmount <= 0n) problems.push('borrowAmount must be greater than zero');
  if (buyPrice <= 0n) problems.push('buyPrice must be greater than zero');
  if (sellPrice <= buyPrice) problems.push('sellPrice must be greater than buyPrice (positive spread)');
  if (qty <= 0n) problems.push('qty must be greater than zero');

  const p = previewTrade(borrowAmount, buyPrice, sellPrice, qty);

  if (p.buySpend > borrowAmount) {
    problems.push(`buySpend (${p.buySpend}) exceeds borrowAmount (${borrowAmount})`);
  }
  if (p.profit < p.fee) {
    problems.push(`profit (${p.profit}) does not cover the fee (${p.fee})`);
  }
  if (p.sellProceeds < borrowAmount + p.fee) {
    problems.push(`sellProceeds (${p.sellProceeds}) cannot repay borrowAmount + fee (${borrowAmount + p.fee})`);
  }
  return problems;
}
