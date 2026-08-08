# Simple Flash Loan Demo

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Midnight Network](https://img.shields.io/badge/Midnight%20Network-Compact-8a63ff?style=flat)](https://midnight.network)

> ✅ **Deployed to Midnight Preview** — contract address:
> `f0b1e31ef61b6d10df27396667ee666e77c4f94d52fa09f3dfd1b3ec90d854e7`

A zero-knowledge flash loan demo on the [Midnight Network](https://midnight.network): anyone can borrow liquidity from a public vault **without collateral**, on one condition — the loan must be borrowed and repaid inside the **same transaction**. The classic use case, arbitrage between two markets, is demonstrated end-to-end with the trade strategy kept **private** through zero-knowledge witnesses.

---

## Overview

A flash loan borrows a large amount with no collateral as long as it is fully repaid (principal + fee) in the same block. If the borrower cannot repay, the entire transaction **reverts atomically** — no state change, no partial execution, nothing charged.

This project demonstrates the pattern on Midnight in three parts:

- A **Compact smart contract** (`contracts/flash-loan.compact`) holding a public liquidity vault and enforcing the repay-or-revert rule on-chain.
- A **TypeScript backend** (`src/`) that deploys the contract, funds the vault, executes flash loans, and lets the operator withdraw accrued profit.
- A **React browser DApp** (`frontend/`) that connects a Midnight browser wallet (1AM / Lace) over the DApp Connector API (CAIP-372) and interacts with the same deployed contract.

## Problem

On transparent blockchains, arbitrage suffers two constraints:

1. **Capital is required** — capturing an opportunity across two markets needs funds available instantly; locked-up capital is expensive and slow to reposition.
2. **The trade is visible** — on public ledgers the buy/sell prices, quantity and route are readable by everyone, exposing profitable strategies to front-running (MEV) bots.

Flash loans solve the capital problem but not the privacy problem: a traditional flash-loan contract publishes the entire trade when it executes.

## Solution

A flash loan **plus privacy**. Midnight's data-protecting ledger lets the contract:

- **Borrow without collateral** and enforce atomic repayment **on-chain** — an unrepayable loan reverts the whole transaction.
- **Keep the trade private** — the arbitrageur's `buyPrice`, `sellPrice` and `qty` flow only through a zero-knowledge **witness**. They are *proven*, never published. The chain only sees the disclosed profit and fee.

The result: arbitrage with instant, collateral-free capital whose strategy never leaves the borrower's machine.

## Features

- 🔒 **Zero-collateral flash loans** — atomic repay-or-revert; an unprofitable loan reverts the whole transaction with no state change.
- 🤫 **Private trade witness** — prices, quantity and route are proven in zero knowledge; only the resulting profit is disclosed.
- 💸 **Automatic atomic repayment** — principal + fee are returned in the same transaction or the loan never happens.
- 🏦 **Vault funding** — anyone can add liquidity; the vault balance is public and enforced against the loan size on-chain.
- 📜 **Public ledger** — vault balance, accrued profit and loan activity are readable via the indexer in real time.
- 🎯 **Live activity** — the DApp shows a live timeline from proof generation through on-chain confirmation.
- 🧮 **Profit calculation** — client-side preview mirrors the contract's fee model before anything is submitted.
- 💼 **Performance fee** — `0.1%` base fee (`borrowAmount / 1000`) + `10%` performance fee (`profit / 10`).
- 👛 **Wallet integration** — connect 1AM or Lace over the DApp Connector API (CAIP-372); no backend server required.

## Architecture

The browser DApp talks directly to the deployed contract through a Midnight browser wallet — five layers, no middleman.

```
┌────────────────────────────────────────────────────────────┐
│ 1. FRONTEND — React + Vite + TypeScript DApp (frontend/)   │
└──────────────────────────┬─────────────────────────────────┘
                           │ window.midnight (DApp Connector API, CAIP-372)
┌──────────────────────────▼─────────────────────────────────┐
│ 2. MIDNIGHT JS SDK — providers, wallet bridge, witnesses   │
└──────────────────────────┬─────────────────────────────────┘
                           │ proof generation + signed transaction
┌──────────────────────────▼─────────────────────────────────┐
│ 3. COMPACT SMART CONTRACT — vault, atomic repayment, ZK    │
└──────────────────────────┬─────────────────────────────────┘
                           │ proof request / verification
┌──────────────────────────▼─────────────────────────────────┐
│ 4. PROOF SERVER — local docker compose (:6300)             │
└──────────────────────────┬─────────────────────────────────┘
                           │ submit transaction / subscribe
┌──────────────────────────▼─────────────────────────────────┐
│ 5. MIDNIGHT NETWORK — local devnet or public preview       │
└─────────────────────────────────────────────────────────────┘
```

Detailed walkthroughs live in [`docs/architecture/`](docs/architecture/architecture.md).

### The contract (`contracts/flash-loan.compact`)

| Circuit | Purpose |
| --- | --- |
| `constructor` | Initializes the vault and commits the operator's public key (SHA-256 of a domain-separated secret). |
| `fund(amount)` | A lender or the operator adds liquidity to the vault. |
| `executeFlashLoan(borrowAmount, pair)` | Borrows, arbitrages and repays atomically; discloses only profit and fee; rejects any trade that cannot repay principal + fee. |
| `withdrawProfit(amount)` | The operator redeems accrued profit, proving in zero knowledge that they hold the committed secret. |
| `divMod(x, y)` | Witness-verified division (Compact has no `/`); the prover supplies the quotient/remainder and the circuit checks `q * y + r == x`. |
| `deriveOperatorPublicKey(sk)` | Domain-separated commitment of the operator secret. |

Witnesses: `getTrade()` (private buy/sell prices + quantity), `getOperatorSecret()`, and `divMod()`. None of the private inputs are ever written to the ledger.

### Backend (`src/`)

- `network.ts` — network resolution and endpoints (`undeployed` local devnet, `preview`, `preprod`), persisted in `.midnight-state.json`.
- `wallet.ts` / `wallet-state.ts` — wallet construction from a per-network seed and on-disk sync-state persistence/restore.
- `deploy.ts` — syncs the wallet, registers NIGHT UTXOs for DUST generation, and deploys the compiled contract.
- `setup.ts` — one-command orchestrator: `docker compose up` for the required services → `compile` → `deploy`.
- `cli.ts` — interactive menu to run the full flash-loan lifecycle against a deployed contract.
- `check-balance.ts` — prints wallet address, network, tNight and DUST balances.
- `flash-loan.logic.ts` — pure client-side mirror of the contract's fee model and assertions (also used by the unit tests).

### Frontend (`frontend/`)

- React + Vite + TypeScript DApp that talks to the contract **without a backend**.
- `WalletConnect` discovers wallets injected into `window.midnight` (1AM / Lace) and connects via the DApp Connector API.
- `FlashLoanFeature` orchestrates **Borrow**, **Fund** and **Vault** panels plus a live activity log, with client-side trade preview and validation matching the contract's own assertions.
- `midnight/providers.ts` bridges the Midnight providers (private state, public data, ZK config, proof, wallet, midnight) using the wallet's advertised endpoints, with configured fallbacks.
- ZK artifacts (`.bzkir`, `.prover`, `.verifier`) are copied from the compiled contract into `public/midnight/flash-loan/` and fetched at runtime.

### Tests (`tests/`)

- `tests/flash-loan.logic.test.ts` — 21 pure unit tests of the fee model and trade validation (no network needed).
- `tests/flash-loan.test.ts` — integration tests that deploy a fresh contract on the **local devnet** and exercise the full lifecycle (fund → profitable loan → atomic revert → operator withdrawal).
- `scripts/e2e-check.ts` — read-only smoke check against the deployed contract on the active network.

### Deployment flow

1. Generate/persist a per-network wallet seed.
2. Sync the wallet against the network.
3. Register NIGHT UTXOs for DUST generation (dust pays transaction fees).
4. Deploy the compiled contract and record the address in `.midnight-state.json`.

## Project Structure

```
simple-flash-loan-demo/
├── contracts/
│   ├── flash-loan.compact              # the Compact smart contract
│   └── managed/flash-loan/             # compiled artifacts (zkir, keys, contract) — generated by `npm run compile`
├── src/
│   ├── network.ts                      # network config + .midnight-state.json persistence
│   ├── wallet.ts                       # wallet construction (WalletFacade) and state restore
│   ├── wallet-state.ts                 # on-disk wallet sync-state format
│   ├── deploy.ts                       # deploy the compiled contract
│   ├── setup.ts                        # orchestrates compose → compile → deploy
│   ├── cli.ts                          # interactive CLI for the full lifecycle
│   ├── check-balance.ts                # wallet address + balance reporter
│   └── flash-loan.logic.ts             # pure mirror of the contract fee model/assertions
├── scripts/
│   └── e2e-check.ts                    # read-only e2e smoke check against the deployed contract
├── tests/
│   ├── flash-loan.logic.test.ts        # 21 unit tests (pure logic)
│   └── flash-loan.test.ts              # integration tests (local devnet lifecycle)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                     # app shell: glass nav, hero, dashboard, empty state
│   │   ├── config.ts                   # VITE_* configuration (all public)
│   │   ├── format.ts                   # display helpers (balances, time, tx short ids)
│   │   ├── components/                 # WalletConnect, FlashLoanFeature, BorrowPanel,
│   │   │                               # FundPanel, VaultPanel, ActivityPanel, StatusBanner, icons
│   │   ├── hooks/                      # useMidnight (wallet session), useExecutionTimeline (progress)
│   │   └── midnight/                   # contract-service, providers, trade-preview,
│   │                                   # types, in-memory-private-state-provider, compiled-contract
│   ├── scripts/copy-zk-assets.mjs      # copies compiled artifacts into the bundle
│   ├── public/midnight/flash-loan/     # ZK artifacts served to the DApp
│   ├── .env / .env.example             # VITE_* public configuration
│   └── vercel.json                     # Vercel build settings
├── docs/
│   ├── architecture/                   # architecture.md, trade-flow.md
│   └── images/                         # README screenshots
├── compose.yml                         # local devnet (node, indexer, proof-server)
├── .env.example                        # optional backend overrides (all placeholders)
├── package.json                        # root scripts, SDK dependencies
├── vitest.config.ts                    # Vitest pool/timeouts for the SDK tests
└── .midnight-state.json                # active network, per-network seeds + deployments (git-ignored)
```

## Installation

**Prerequisites**

- **Node.js ≥ 22** and `npm`
- **Docker + Docker Compose** (for the local devnet and the proof server used on public networks)
- **Compact compiler CLI** (`compact` on PATH) — required by `npm run compile`
- A **Midnight browser wallet** (1AM or Lace) for the frontend

```bash
# 1. Install root dependencies
npm install

# 2. Install frontend dependencies
npm --prefix frontend install

# 3. (Optional) Start the local devnet and compile + deploy on it
npm run setup
```

## Running the Project

All scripts from the root `package.json`:

| Command | Description |
| --- | --- |
| `npm run compile` | Compile `contracts/flash-loan.compact` into `contracts/managed/flash-loan`. |
| `npm run build` | Type-check the backend (`tsc --noEmit`). |
| `npm run setup` | Bring up required Docker services, compile, and deploy (network-aware). |
| `npm run deploy` | Deploy the compiled contract to the active network (defaults to `undeployed`). |
| `npm run cli` | Interactive CLI to fund, flash-loan, withdraw profit, and inspect state. |
| `npm run check-balance` | Show wallet address, network, tNight and DUST balances. |
| `npm run network` | Show or switch the active network (e.g. `npm run network preview`). |
| `npm run test` | Run all Vitest tests. |
| `npm run test:unit` | Run the pure-logic unit tests. |
| `npm run test:integration` | Run lifecycle integration tests against the local devnet. |
| `npm run test:e2e` | Reconnect to the deployed contract and read its on-chain ledger. |
| `npm run frontend:dev` | Start the Vite dev server for the frontend. |
| `npm run frontend:build` | Build the frontend for production. |
| `npm run frontend:preview` | Preview the production frontend build. |
| `npm run proof-server:start` | Start the local devnet services (`docker compose up -d`). |
| `npm run proof-server:stop` | Stop the local devnet services (`docker compose down`). |
| `npm run clean` | Remove generated artifacts (`contracts/managed`, network/wallet state, frontend `dist`/`node_modules`). |

Full local setup on the devnet network:

```bash
npm run setup
```

### Frontend

The frontend is a standalone Vite app in `frontend/` that talks directly to the deployed contract through a Midnight browser wallet — no backend server required.

```bash
# Development server (http://localhost:5173)
npm run frontend:dev

# Production build (copies ZK assets, type-checks, bundles)
npm run frontend:build

# Preview the production build
npm run frontend:preview
```

Inside `frontend/`, the build pipeline first runs `copy-zk-assets` (`node scripts/copy-zk-assets.mjs`) to copy the compiled contract module and ZK artifacts into the bundle, then runs `tsc -b` and `vite build`. The Vite config wires the WASM / top-level-await / Node-polyfill / CommonJS plugins required to bundle the Midnight toolchain for the browser.

The DApp connects to `window.midnight` wallets (1AM / Lace) via the DApp Connector API (CAIP-372), then builds providers from the wallet's advertised indexer/proof endpoints (falling back to the configured values). `withdrawProfit` is intentionally not exposed in the browser — the on-chain operator check can only succeed for the operator who ran `npm run deploy`.

### Deploying to Midnight Preview

1. **Switch to the Preview network:**

   ```bash
   npm run network preview
   ```

2. **Bring up the proof server** (used for ZK proof generation on public networks):

   ```bash
   npm run proof-server:start
   ```

3. **Fund the wallet.** Deploy prints the CLI wallet address (persisted as the Preview seed in `.midnight-state.json`). Fund it with tNIGHT from the network faucet or by transferring from another Preview wallet. Verify with:

   ```bash
   npm run check-balance
   ```

4. **Deploy:**

   ```bash
   npm run deploy
   ```

   The script syncs the wallet, registers NIGHT UTXOs for DUST generation, generates the proof, submits the deployment transaction, and records the result in `.midnight-state.json`. Note that a local **proof server** (`docker compose`) must be running — the Preview network itself does not provide one.

5. **Interact with the deployed contract:**

   ```bash
   npm run cli
   ```

**Current Preview deployment:**

- **Contract address:** `f0b1e31ef61b6d10df27396667ee666e77c4f94d52fa09f3dfd1b3ec90d854e7`
- **Deployer wallet:** `mn_addr_preview17m8rpzu2e262dh6sf8gdzwwrl96ddj5a7eld8mcju9yqu0y40nssax5gt5`

## Technologies

| Layer | Technology |
| --- | --- |
| Smart contract | Compact (`pragma language_version >= 0.23`) |
| Contract runtime | `@midnight-ntwrk/compact-runtime` 0.16.0, `@midnight-ntwrk/ledger-v8` 8.1.0 |
| Backend | TypeScript, Node.js ≥ 22, `tsx`, `ws`, `rxjs` |
| Midnight.js | `@midnight-ntwrk/midnight-js-*` 4.1.1 (contracts, indexer, level private state, node ZK config, HTTP proof provider, network-id, protocol, types, utils) |
| Wallet SDK | `@midnight-ntwrk/wallet-sdk` 1.2.0 |
| Frontend | React 19, Vite 6, TypeScript, `@midnight-ntwrk/dapp-connector-api` 4.0.1 |
| Testing | Vitest 3 (unit + integration), custom e2e script |
| Local devnet | Docker Compose: `midnight-node` 1.0.0, `indexer-standalone` 4.3.3, `proof-server` 8.1.0 |

## Configuration

### Frontend (`frontend/.env`, template: `frontend/.env.example`)

All values are public. No secrets belong here.

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_CONTRACT_ADDRESS` | Contract address to connect to. | Preview deployment address |
| `VITE_NETWORK_ID` | Network id passed to the wallet's `connect()`. | `preview` |
| `VITE_PROOF_SERVER_URL` | Proof server when the wallet advertises none. | `http://localhost:6300` |
| `VITE_INDEXER_URL` | Indexer HTTP endpoint (fallback). | Preview indexer |
| `VITE_INDEXER_WS_URL` | Indexer WebSocket endpoint (fallback). | Preview indexer WS |
| `VITE_LEDGER_POLL_MS` | Public-ledger poll interval. | `5000` |
| `VITE_EXPLORER_URL` | Optional block-explorer base URL for transaction links (`{txId}` placeholder). | unset (links hidden) |

The current `frontend/.env` is configured for the Preview deployment listed above.

### Backend environment variables (template: `.env.example`)

All are optional overrides; defaults live in `src/network.ts` and `.midnight-state.json`.

| Variable | Purpose |
| --- | --- |
| `MIDNIGHT_WALLET_SEED` | Override the per-network wallet seed. |
| `MIDNIGHT_INDEXER_URL` / `MIDNIGHT_INDEXER_WS_URL` | Override the indexer endpoints. |
| `MIDNIGHT_NODE_URL` | Override the node RPC endpoint. |
| `MIDNIGHT_FAUCET_URL` | Override the faucet URL. |
| `MIDNIGHT_PROOF_SERVER_URL` | Override the proof-server URL. |
| `MIDNIGHT_FAUCET_TIMEOUT_MS` | How long deploy waits for faucet funding before giving up (default 600 000 ms). |
| `PRIVATE_STATE_PASSWORD` | Password for the level-based private-state store (must be ≥ 16 chars). |

### State files

- `.midnight-state.json` — active network, per-network seeds, and deployed contract records (git-ignored).
- `.midnight-wallet-state/` — per-network serialized wallet sync state for fast restarts (git-ignored).

## Testing

| Command | What it does |
| --- | --- |
| `npm run test:unit` | Runs `tests/flash-loan.logic.test.ts` — 21 tests covering the fee model (0.1% base + 10% performance, floor behavior), the `divMod` witness arithmetic, the `validateTrade` assertion mirror, and operator-secret derivation. Pure logic, no network needed. |
| `npm run test:integration` | Runs `tests/flash-loan.test.ts` — deploys its own fresh contract on the **local devnet** and verifies the full lifecycle: empty vault on deploy, funding, a profitable flash loan settling the fee, an atomic revert of an unrepayable loan, and a zero-knowledge operator withdrawal. Requires `npm run compile` and the devnet up (`npm run proof-server:start`). |
| `npm run test:e2e` | Runs `scripts/e2e-check.ts` — a read-only smoke check that reconnects to the contract deployed on the active network, reads its on-chain ledger via the indexer, and prints the public state. |
| `npm test` | Runs the full Vitest suite (unit + integration). |

### Verification results

| # | Check | Result |
| --- | --- | --- |
| 1 | Preview wallet funded (`check-balance` > 0 tNight) | ✅ PASS |
| 2 | Preview deployment (`npm run deploy`) | ✅ PASS |
| 3 | On-chain confirmation (contract reconnected and read via indexer) | ✅ PASS |
| 4 | Contract address recorded in `.midnight-state.json` | ✅ PASS |
| 5 | Frontend configured for Preview (`frontend/.env` + `.env.example`) | ✅ PASS |
| 6 | `npm run build` (TypeScript check) | ✅ PASS |
| 7 | `npm run test:unit` (21 tests) | ✅ PASS |
| 8 | `npm run test:integration` (local devnet lifecycle) | ✅ PASS |
| 9 | `npm run test:e2e` (live Preview ledger read) | ✅ PASS |
| 10 | `npm run frontend:build` (Vite production build) | ✅ PASS |

## Future Improvements

- **Real DEX integration** — replace the simulated trade inputs with a live on-chain order book or DEX adapter so arbitrage executes against actual liquidity.
- **Multi-pair routing** — extend the contract to arbitrage across several pairs in one atomic transaction.
- **Delegated / hosted proving** — move proof generation off the user's machine for a smoother browser experience on public networks.
- **Operator key management** — support an HSM or hardware-backed operator secret instead of a seed-derived key.
- **Faucet automation** — retry funding automatically instead of polling, and surface clear guidance when a faucet is unavailable.
- **Richer monitoring** — expose the public ledger (vault, fees, loans) on a dashboard with historical charts.
- **More private accounting** — disclose only what the fee model requires, and explore mechanisms that reduce the amount of profit that must cross the public boundary.

## Author

© 2026 Sujal Chavan
