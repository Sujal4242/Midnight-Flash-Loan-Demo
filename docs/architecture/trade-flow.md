# Flash-loan trade flow

A flash loan borrows liquidity without collateral on the condition that
principal **and** fee are repaid in the **same transaction**. This walkthrough
follows a single execution from the browser DApp to the ledger.

## 1. Connect the wallet

The user connects a Midnight browser wallet (1AM / Lace) through the DApp
Connector API (CAIP-372). `useMidnight` builds the provider stack from the
wallet's advertised endpoints, falling back to the `VITE_*` configuration for
the indexer and proof server.

## 2. Enter the trade

The user describes the arbitrage: pair, quantity (`qty`), buy price and sell
price. The app derives the required loan size client-side:

```
borrowAmount = qty × buyPrice
```

> The same derivation lives in `frontend/src/midnight/trade-preview.ts` and
> `src/flash-loan.logic.ts`, mirroring the contract so the client can validate
> before submitting.

## 3. Validate and preview

The client runs `validateTrade` against the same assertions the contract
enforces on-chain:

- the vault balance must cover `borrowAmount`,
- `buySpend = qty × buyPrice` must not exceed `borrowAmount`,
- the expected `sellProceeds = qty × sellPrice` must cover
  `borrowAmount + fee`.

It then previews the economics:

```
profit = sellProceeds − buySpend − baseFee
baseFee        = borrowAmount / 1000     (0.1%)
performanceFee = profit / 10             (10%)
fee            = baseFee + performanceFee
```

## 4. Submit (proof generation)

`contract-service.executeFlashLoan` builds the contract transaction. The
`getTrade` witness privately supplies `buySpend` and `sellProceeds`; the
`divMod` witness supplies the division operands. The wallet generates a
zero-knowledge proof locally or via the proof server and signs the
transaction. **None of the trade inputs are published.**

## 5. Atomic settlement

The transaction is submitted to the network. If the sell proceeds cannot
repay principal plus fee, the **entire transaction reverts** — no state
change, no partial execution, nothing charged. Otherwise the ledger records
the loan, and the disclosed profit accrues to the operator.

## 6. Ledger updates

The DApp observes the public ledger through the indexer (polls every
`VITE_LEDGER_POLL_MS`, default 5 s): the vault balance drops during the loan
and returns after repayment, and the accrued operator profit increases by the
disclosed fee. The activity panel renders the confirmed transaction.

## Operator withdrawal

The vault's accrued profit is redeemable only by the operator, who proves in
zero knowledge that they hold the secret whose SHA-256 commitment was stored
at deploy time (`deriveOperatorPublicKey`). The backend `npm run cli` exposes
this; the browser DApp intentionally does not, because only the deployer can
satisfy the on-chain check.

## What is private vs. public

| Data | Visibility |
| --- | --- |
| `qty`, `buyPrice`, `sellPrice`, trade route | Private — inside the `getTrade` witness |
| Operator secret | Private — committed via SHA-256 on-chain |
| `borrowAmount`, profit, fees | Public — required by the fee model |
| Vault balance, accrued operator profit | Public — readable via the indexer |
