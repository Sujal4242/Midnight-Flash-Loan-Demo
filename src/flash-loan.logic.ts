/**
 * Pure logic that mirrors the flash-loan contract's arithmetic
 * (contracts/flash-loan.compact) and its on-chain assertions.
 *
 * The contract has no `/` operator, so quotients are supplied by the divMod
 * witness and verified with multiplication. This module computes those same
 * quotients the way the client (CLI / tests) provides them — bigint division,
 * which for the non-negative values the contract accepts equals floor division.
 */
import { createHash } from 'node:crypto';

export interface Trade {
  buyPrice: bigint;
  sellPrice: bigint;
  qty: bigint;
}

export interface TradePreview {
  buySpend: bigint;
  sellProceeds: bigint;
  profit: bigint;
  baseFee: bigint;
  performanceFee: bigint;
  fee: bigint;
}

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
export function previewTrade(borrowAmount: bigint, buyPrice: bigint, sellPrice: bigint, qty: bigint): TradePreview {
  const buySpend = buyPrice * qty;
  const sellProceeds = sellPrice * qty;
  const profit = sellProceeds - buySpend;
  const baseFee = borrowAmount / BASE_FEE_DIVISOR;
  const performanceFee = profit / PERFORMANCE_FEE_DIVISOR;
  const fee = baseFee + performanceFee;
  return { buySpend, sellProceeds, profit, baseFee, performanceFee, fee };
}

// Same quotient the divMod witness returns for the contract.
export function divMod(x: bigint, y: bigint): [bigint, bigint] {
  return [x / y, x % y];
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

// Deterministic operator secret (32 bytes) derived from the wallet seed, so
// deploy (constructor commitment) and withdrawProfit always agree. Only its
// SHA-256 commitment (the `operator` ledger field) is ever public.
export function deriveOperatorSecret(seed: string): Uint8Array {
  return createHash('sha256').update(`flash-loan-operator-secret-v1:${seed}`).digest();
}
