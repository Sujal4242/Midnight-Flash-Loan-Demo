# Architecture

The project is organized in five layers. The browser DApp never talks to a
backend — it interacts with the deployed Compact contract directly through a
Midnight browser wallet.

```
┌────────────────────────────────────────────────────────────┐
│ 1. FRONTEND — React + Vite + TypeScript DApp (frontend/)   │
│    WalletConnect · BorrowPanel · FundPanel · VaultPanel     │
│    ActivityPanel · StatusBanner · useExecutionTimeline      │
└──────────────────────────┬─────────────────────────────────┘
                           │ window.midnight (DApp Connector API, CAIP-372)
┌──────────────────────────▼─────────────────────────────────┐
│ 2. MIDNIGHT JS SDK (frontend/src/midnight/)                │
│    providers.ts bridges the seven providers (private state,│
│    public data, ZK config, proof, wallet, midnight) using  │
│    the wallet's advertised endpoints with configured fallbacks │
└──────────────────────────┬─────────────────────────────────┘
                           │ proof generation + signed transaction
┌──────────────────────────▼─────────────────────────────────┐
│ 3. COMPACT SMART CONTRACT (contracts/flash-loan.compact)   │
│    constructor · fund · executeFlashLoan · withdrawProfit   │
│    divMod · deriveOperatorPublicKey                         │
│    private witnesses: getTrade · getOperatorSecret · divMod │
└──────────────────────────┬─────────────────────────────────┘
                           │ proof request / verification
┌──────────────────────────▼─────────────────────────────────┐
│ 4. PROOF SERVER (docker compose, :6300)                    │
│    Generates zero-knowledge proofs when the wallet does not │
│    advertise one (public networks). Local devnet only.      │
└──────────────────────────┬─────────────────────────────────┘
                           │ submit transaction / subscribe
┌──────────────────────────▼─────────────────────────────────┐
│ 5. MIDNIGHT NETWORK                                        │
│    Local devnet (node + indexer + proof-server, compose.yml)│
│    or public Preview / Preprod (RPC + indexer + faucet)     │
└─────────────────────────────────────────────────────────────┘
```

## Layer details

### 1. Frontend

A standalone Vite app in `frontend/` that connects to the contract without any
backend server. Key pieces:

- `components/WalletConnect.tsx` — discovers wallets injected into
  `window.midnight` (1AM / Lace) and connects over the DApp Connector API.
- `components/FlashLoanFeature.tsx` — orchestrates the **Fund** and **Execute
  Flash Loan** panels plus the live public-ledger view and activity log.
- `components/BorrowPanel.tsx` — captures the trade (pair, quantity, buy price,
  sell price), previews profit/fee client-side, and submits the flash loan.
- `components/VaultPanel.tsx` / `components/FundPanel.tsx` — show the public
  vault state and let the user add liquidity.
- `hooks/useMidnight.ts` — session lifecycle around the wallet and providers.
- `hooks/useExecutionTimeline.ts` — drives the prepare → generate proof →
  sign → submit → confirm progress states.
- `src/midnight/contract-service.ts` — the only file that talks to the
  compiled contract (`executeFlashLoan`, `fundVault`, `readLedger`).
- `src/midnight/providers.ts` — builds the Midnight providers from the
  wallet-advertised endpoints (indexer, proof server) with fallbacks from
  `VITE_*` configuration.

### 2. Midnight JS SDK

The browser DApp uses the DApp Connector API (CAIP-372) exposed by Midnight
wallets. The SDK provides the provider abstractions — private state, public
ledger data, zero-knowledge configuration, proof generation, wallet access,
and network identity — which the app composes in `providers.ts`.

The compiled contract module and ZK artifacts (`.bzkir`, `.prover`, `.verifier`)
are copied into the bundle by `frontend/scripts/copy-zk-assets.mjs` and fetched
at runtime.

### 3. Compact smart contract

See [The contract](../README.md#the-contract) in the README for the circuit
table. Everything secret — the trade prices/quantity, the operator secret, and
division operands — flows through **witnesses** and is proven rather than
published. The contract's own assertions enforce the repay-or-revert rule
on-chain:

- the vault must hold at least the borrowed amount,
- the buy spend may not exceed the borrowed amount,
- the sell proceeds must cover principal plus fee.

### 4. Proof server

Proof generation happens on the user's machine (local devnet) or via the local
proof server (`docker compose`, port 6300) for public networks. The DApp falls
back to `VITE_PROOF_SERVER_URL` when the wallet does not advertise its own
proof endpoint.

### 5. Midnight Network

Two targets:

- **Local devnet** (`undeployed`): `docker compose up` starts `midnight-node`,
  `indexer-standalone` and `proof-server` — the default for integration tests.
- **Public networks** (`preview` / `preprod`): RPC + indexer + faucet endpoints
  from `src/network.ts`; the proof server still runs locally.

## Privacy model

- On-chain state is minimal: the vault balance, the accrued operator profit,
  and the SHA-256 commitment of the operator secret.
- The trade (`buyPrice`, `sellPrice`, `qty`, route) exists only inside the
  `getTrade` witness — it is proven, never written to the ledger.
- The only data disclosed per loan are the ones the fee model requires: the
  borrowed amount, the profit, and the resulting fees.
- Browser private state is in-memory and passed per call through the witness;
  nothing secret is persisted by the DApp.
