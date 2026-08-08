/**
 * End-to-end smoke check for simple-flash-loan-demo.
 *
 * Reconnects to the deployed contract, reads its ledger state, and exits 0 on
 * success. Used by `npm run test:e2e` and by CI workflows.
 *
 * Read-only: never balances or submits transactions, never touches wallet
 * state on disk.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { resolveNetwork, getOrCreateSeed, getDeployment } from '../src/network';
import { createWallet, type WalletContext } from '../src/wallet';
import { deriveOperatorSecret } from '../src/flash-loan.logic';

// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

// Must match the privateStateId used at deploy time (src/deploy.ts).
const PRIVATE_STATE_ID = 'flashLoanPrivateState';

// ─── Network configuration ─────────────────────────────────────────────────────

const { network, config: networkConfig } = resolveNetwork();
const SEED = getOrCreateSeed(network);

function fail(msg: string): never {
  console.error(`\n❌ e2e-check failed: ${msg}`);
  process.exit(1);
}

function isHexAddress(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-fA-F]+$/.test(s) && s.length >= 32;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Deployment sanity: a record must exist on file (created by npm run deploy).
  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}.`);
    console.error('Run `npm run deploy` first, or switch networks with `npm run network <name>`.');
    process.exit(1);
  }
  if (!isHexAddress(deployment.address)) {
    fail(`Deployment address missing or invalid: ${JSON.stringify(deployment, null, 2)}`);
  }

  // 2. Build wallet and providers.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'flash-loan');
  const contractPath = path.join(zkConfigPath, 'contract', 'index.js');
  if (!fs.existsSync(contractPath)) fail('Compiled contract missing — run `npm run compile`.');

  const FlashLoan = await import(pathToFileURL(contractPath).href);
  const operatorSecret = deriveOperatorSecret(SEED);
  let witnessTrade = { buyPrice: 0n, sellPrice: 0n, qty: 0n };

  const CC: any = CompiledContract;
  const compiledContract = CC
    .make('flash-loan', FlashLoan.Contract)
    .pipe(
      CC.withWitnesses({
        getTrade: (context: any) => [context.privateState, witnessTrade],
        getOperatorSecret: (context: any) => [context.privateState, operatorSecret],
        divMod: (context: any, x: bigint, y: bigint) => [context.privateState, [x / y, x % y]],
      }),
      CC.withCompiledFileAssets(zkConfigPath),
    );

  const walletCtx: WalletContext = await createWallet({ network, networkConfig, seed: SEED });
  await walletCtx.wallet.waitForSyncedState();

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const walletProvider = {
    // Midnight.js 4.1.x returns the key objects (CoinPublicKey / EncPublicKey).
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx() {
      throw new Error('e2e-check is read-only and should not balance transactions');
    },
    submitTx() {
      throw new Error('e2e-check is read-only and should not submit transactions');
    },
  } as any;

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'flash-loan-state',
      accountId: walletCtx.unshieldedKeystore.getBech32Address().toString(),
      // SDK requires ≥16 chars. e2e-check is read-only so we use the same
      // local-devnet default as deploy.ts (no env override needed here).
      privateStoragePasswordProvider: () => 'Local-Devnet-Development-Placeholder-1',
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  // 3. Reconnect to the deployed contract — proves the callTx interface is
  // wired with the same privateStateId + witness set used at deploy time.
  try {
    await findDeployedContract(providers, {
      contractAddress: deployment.address,
      compiledContract: compiledContract as any,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
  } catch (err: any) {
    await walletCtx.wallet.stop();
    fail(`findDeployedContract threw: ${err?.message ?? err}`);
  }

  // 4. Read the on-chain ledger via the public data provider — proves the
  // contract is indexed and queryable on the chain itself.
  const onChainState = await providers.publicDataProvider.queryContractState(deployment.address);
  if (!onChainState) {
    await walletCtx.wallet.stop();
    fail(`queryContractState returned null for ${deployment.address}`);
  }

  const ledger = FlashLoan.ledger(onChainState.data);
  const fmt = (v: unknown) => (typeof v === 'bigint' ? v.toLocaleString() : String(v));

  console.log('\n✅ e2e-check passed');
  console.log('   ──────────────────────────────────────────────────────');
  console.log(`   network:             ${network}`);
  console.log(`   contractAddress:     ${deployment.address}`);
  console.log('   ──────────────────────────────────────────────────────');
  console.log(`   vaultBalance:        ${fmt(ledger.vaultBalance)}`);
  console.log(`   profitBalance:       ${fmt(ledger.profitBalance)}`);
  console.log(`   loansCompleted:      ${fmt(ledger.loansCompleted)}`);
  console.log(`   totalBorrowed:       ${fmt(ledger.totalBorrowed)}`);
  console.log(`   lastPair:            ${ledger.lastPair || '(none)'}`);
  console.log(`   lastProfit:          ${fmt(ledger.lastProfit)}`);
  console.log(`   lastFee:             ${fmt(ledger.lastFee)}`);
  console.log(`   operator:            0x${Buffer.from(ledger.operator).toString('hex')}`);
  console.log('   ──────────────────────────────────────────────────────\n');

  await walletCtx.wallet.stop();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
