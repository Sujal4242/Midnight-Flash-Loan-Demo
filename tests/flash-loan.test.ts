/**
 * Integration test: full flash-loan lifecycle against the local Midnight devnet.
 *
 * Requires `docker compose up -d --wait` (node + indexer + proof-server) and a
 * compiled contract (`npm run compile`). Self-contained: deploys its OWN fresh
 * contract, so it does not depend on a prior `npm run setup`.
 *
 *   Run:  npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import { NETWORK_CONFIGS, getOrCreateSeed } from '../src/network';
import { createWallet, unshieldedToken, type WalletContext } from '../src/wallet';
import { deriveOperatorSecret, type Trade } from '../src/flash-loan.logic';

// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

const network = 'undeployed' as const;
const networkConfig = NETWORK_CONFIGS[network];
const SEED = getOrCreateSeed(network);
const PRIVATE_STATE_ID = 'flashLoanTestPrivateState';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'flash-loan');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

if (!fs.existsSync(contractPath)) {
  throw new Error('Contract not compiled — run `npm run compile` first.');
}

const FlashLoan = await import(pathToFileURL(contractPath).href);

// ─── Fixtures ──────────────────────────────────────────────────────────────────

// A profitable trade: borrow 1,000, spend it all (10 × 100), sell for 1,200.
//   profit = 200, base fee = 1000/1000 = 1, performance fee = 200/10 = 20,
//   total fee = 21, proceeds 1,200 ≥ 1,000 + 21. Passes all assertions.
const GOOD_TRADE: Trade = { buyPrice: 10n, sellPrice: 12n, qty: 100n };
const GOOD_BORROW = 1_000n;

// A trade that must REVERT: borrow 100,000 but the trade only turns 1,200
// total, so sellProceeds < borrowAmount + fee.
const REVERTING_TRADE: Trade = { buyPrice: 10n, sellPrice: 12n, qty: 100n };
const REVERTING_BORROW = 100_000n;

const FUND_AMOUNT = 1_000_000n;
const WITHDRAW_AMOUNT = 21n;

// ─── Test scaffolding ──────────────────────────────────────────────────────────

let walletCtx: WalletContext;
let providers: any;
let contractAddress: string;
let deployed: any;
let witnessTrade: Trade = GOOD_TRADE;

// Mirrors the CLI: witnesses are bound at CompiledContract creation and read
// this mutable holder, so each executeFlashLoan call supplies its own trade.
const compiledContract = (CompiledContract as any)
  .make('flash-loan', FlashLoan.Contract)
  .pipe(
    (CompiledContract as any).withWitnesses({
      getTrade: (context: any) => [context.privateState, witnessTrade],
      getOperatorSecret: (context: any) => [context.privateState, deriveOperatorSecret(SEED)],
      divMod: (context: any, x: bigint, y: bigint) => [context.privateState, [x / y, x % y]],
    }),
    (CompiledContract as any).withCompiledFileAssets(zkConfigPath),
  );

async function buildWalletProviders() {
  const privateStatePassword = 'Local-Devnet-Development-Placeholder-1';

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'flash-loan-test-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

async function registerDustAndWait() {
  const dustState = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const unregisteredUtxos = dustState.unshielded.availableCoins.filter(
    (c: any) => !c.meta?.registeredForDustGeneration,
  );
  if (unregisteredUtxos.length > 0) {
    const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
      unregisteredUtxos,
      walletCtx.unshieldedKeystore.getPublicKey(),
      (payload) => walletCtx.unshieldedKeystore.signData(payload),
    );
    await walletCtx.wallet.submitTransaction(await walletCtx.wallet.finalizeRecipe(recipe));
  }
  if (dustState.dust.balance(new Date()) === 0n) {
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }
}

// Polls the indexer until queryContractState returns a ledger matching the
// predicate (the indexer lags the chain slightly after a write).
async function waitForLedger(predicate: (ledger: any) => boolean, timeoutMs = 120_000) {
  const start = Date.now();
  for (;;) {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    if (state) {
      const ledger = FlashLoan.ledger(state.data);
      if (predicate(ledger)) return ledger;
    }
    if (Date.now() - start > timeoutMs) {
      const last = state ? JSON.stringify(FlashLoan.ledger(state.data), (_, v) => (typeof v === 'bigint' ? v.toString() : v)) : 'null';
      throw new Error(`Timed out waiting for ledger state (last: ${last})`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function deployWithRetry() {
  // Same DUST-shortage retry loop as src/deploy.ts (fresh devnet race between
  // wall-clock DUST projection and block-timestamp accounting).
  const MAX_RETRIES = 20;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await deployContract(providers, {
        compiledContract,
        args: [],
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      });
    } catch (err: any) {
      const msg = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
      const isDustShortage =
        msg.includes('Not enough Dust') || msg.includes('Insufficient Funds') || msg.includes('could not balance dust');
      if (!isDustShortage) throw err;
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error('unreachable');
}

beforeAll(async () => {
  walletCtx = await createWallet({ network, networkConfig, seed: SEED, restore: false });
  await walletCtx.wallet.waitForSyncedState();
  providers = await buildWalletProviders();
  await registerDustAndWait();
  await new Promise((r) => setTimeout(r, 6000));
  deployed = await deployWithRetry();
  contractAddress = deployed.deployTxData.public.contractAddress;
}, 1_800_000);

afterAll(async () => {
  await walletCtx.wallet.stop();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('flash-loan contract lifecycle (local devnet)', () => {
  it(
    'deploys with an empty vault',
    async () => {
      const ledger = await waitForLedger((l) => l.operator.length === 32);
      expect(ledger.vaultBalance).toBe(0n);
      expect(ledger.profitBalance).toBe(0n);
      expect(ledger.loansCompleted).toBe(0n);
      expect(ledger.totalBorrowed).toBe(0n);
      // The constructor committed the operator's public key (the ZK commitment
      // of the seed-derived secret), matching what the withdrawProfit witness
      // will later prove knowledge of.
      expect(Buffer.from(ledger.operator)).toEqual(
        Buffer.from(FlashLoan.pureCircuits.deriveOperatorPublicKey(deriveOperatorSecret(SEED))),
      );
    },
    300_000,
  );

  it(
    'funds the vault',
    async () => {
      await deployed.callTx.fund(FUND_AMOUNT);
      const ledger = await waitForLedger((l) => l.vaultBalance === FUND_AMOUNT);
      expect(ledger.vaultBalance).toBe(FUND_AMOUNT);
      expect(ledger.profitBalance).toBe(0n);
    },
    300_000,
  );

  it(
    'executes a profitable flash loan and settles the fee',
    async () => {
      witnessTrade = GOOD_TRADE;
      await deployed.callTx.executeFlashLoan(GOOD_BORROW, 'WBTC-USDT');

      const ledger = await waitForLedger((l) => l.loansCompleted === 1n);
      // Vault only gains the fee (borrow is repaid inside the same tx).
      expect(ledger.vaultBalance).toBe(FUND_AMOUNT + 21n);
      expect(ledger.profitBalance).toBe(21n);
      expect(ledger.loansCompleted).toBe(1n);
      expect(ledger.totalBorrowed).toBe(GOOD_BORROW);
      expect(ledger.lastProfit).toBe(200n);
      expect(ledger.lastFee).toBe(21n);
      expect(ledger.lastPair).toBe('WBTC-USDT');
    },
    300_000,
  );

  it(
    'atomically reverts a trade that cannot repay principal + fee',
    async () => {
      witnessTrade = REVERTING_TRADE;
      let threw = false;
      try {
        await deployed.callTx.executeFlashLoan(REVERTING_BORROW, 'ETH-USDT');
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);

      // The revert is atomic: no state change of any kind.
      const ledger = await waitForLedger((l) => l.loansCompleted === 1n);
      expect(ledger.vaultBalance).toBe(FUND_AMOUNT + 21n);
      expect(ledger.profitBalance).toBe(21n);
      expect(ledger.totalBorrowed).toBe(GOOD_BORROW);
      expect(ledger.lastPair).toBe('WBTC-USDT');
    },
    300_000,
  );

  it(
    'lets the operator withdraw accrued profit (proven in zero knowledge)',
    async () => {
      await deployed.callTx.withdrawProfit(WITHDRAW_AMOUNT);
      const ledger = await waitForLedger((l) => l.profitBalance === 0n);
      expect(ledger.profitBalance).toBe(0n);
      expect(ledger.vaultBalance).toBe(FUND_AMOUNT + 21n);
    },
    300_000,
  );
});
