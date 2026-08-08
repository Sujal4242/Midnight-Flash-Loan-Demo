/** Shared types for the flash-loan browser DApp. */

/** The private arbitrage trade. Only ever a witness input — never on-chain. */
export interface Trade {
  buyPrice: bigint;
  sellPrice: bigint;
  qty: bigint;
}

/** Client-side preview of a trade under the contract's fee model. */
export interface TradePreview {
  buySpend: bigint;
  sellProceeds: bigint;
  profit: bigint;
  baseFee: bigint;
  performanceFee: bigint;
  fee: bigint;
}

/** Decoded public ledger of the flash-loan contract (from the indexer). */
export interface FlashLoanLedger {
  vaultBalance: bigint;
  profitBalance: bigint;
  loansCompleted: bigint;
  totalBorrowed: bigint;
  lastPair: string;
  lastProfit: bigint;
  lastFee: bigint;
  operator: Uint8Array;
}
