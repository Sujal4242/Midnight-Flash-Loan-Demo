/**
 * CLI for interacting with the Simple Flash Loan Demo contract.
 *
 * Demonstrates the full flash-loan lifecycle on Midnight:
 *   1. fund          — lender adds liquidity to the vault
 *   2. executeFlashLoan — borrow + arbitrage + repay atomically, with the
 *                         trade strategy supplied privately via witnesses
 *   3. withdrawProfit — the operator (holder of the secret committed on-chain)
 *                         redeems accrued fees, proving knowledge in ZK
 *   4. read state / balance
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
import { deriveOperatorSecret, previewTrade, type Trade } from './flash-loan.logic';

// Midnight SDK imports
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { resolveNetwork, getOrCreateSeed, getDeployment } from './network';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

// Enable WebSocket for GraphQL subscriptions
// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

// Must match the privateStateId used at deploy time so the CLI reconnects to
// the same private state.
const PRIVATE_STATE_ID = 'flashLoanPrivateState';

const { network, config: networkConfig } = resolveNetwork();
const SEED = getOrCreateSeed(network);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'flash-loan');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

if (!fs.existsSync(contractPath)) {
  console.error('\n❌ Contract not compiled! Run: npm run compile\n');
  process.exit(1);
}

const FlashLoan = await import(pathToFileURL(contractPath).href);

// Witness state. `getTrade` and `divMod` must return the values of the trade
// being executed, so they read from this mutable holder which the CLI updates
// before each executeFlashLoan call.
const operatorSecret = deriveOperatorSecret(SEED);
let witnessTrade: Trade = { buyPrice: 0n, sellPrice: 0n, qty: 0n };

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

// ─── Providers ─────────────────────────────────────────────────────────────────

async function createProviders(walletCtx: WalletContext) {
  // The SDK requires the private-state password to be at least 16 characters.
  // The default below is a placeholder for local devnet only — set a strong
  // password via PRIVATE_STATE_PASSWORD when you move to a non-local target.
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';

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
      privateStateStoreName: 'flash-loan-state',
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: bigint): string {
  return n.toLocaleString('en-US');
}

function toBigInt(input: string, what: string): bigint {
  const n = BigInt(input.trim());
  if (n < 0n) throw new Error(`${what} must be non-negative`);
  return n;
}

// Fetches the decoded on-chain ledger state.
async function readLedger(providers: any, contractAddress: string) {
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;
  return FlashLoan.ledger(contractState.data);
}

// ─── Main CLI ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║            Simple Flash Loan Demo — CLI                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const rl = createInterface({ input: stdin, output: stdout });

  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}. Run \`npm run setup -- --network ${network}\` first.`);
    process.exit(1);
  }
  console.log(`  Contract: ${deployment.address}`);
  console.log(`  Network: ${network}\n`);

  try {
    const seed = SEED;

    console.log('  Connecting to wallet...');
    const walletCtx = await createWallet({ network, networkConfig, seed });
    const restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
    if (restoredCount > 0) {
      console.log(`  Restored ${restoredCount}/3 child wallets from .midnight-wallet-state — sync will resume from saved point.`);
    }

    console.log('  Syncing with network...');
    console.log('  ℹ  This may take several minutes depending on network size.');
    console.log('     RPC disconnection messages during sync are normal and can be safely ignored.\n');
    const syncStart = Date.now();
    const syncInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - syncStart) / 1000);
      process.stdout.write(`\r  ⏳ Still syncing... (${elapsed}s elapsed)   `);
    }, 5000);
    const state = await walletCtx.wallet.waitForSyncedState();
    clearInterval(syncInterval);
    process.stdout.write('\r  ✓ Synced with network.                                      \n');

    await persistWalletState(network, walletCtx);
    const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    console.log(`  Balance: ${fmt(balance)} tNight\n`);

    if (balance === 0n && network !== 'undeployed' && networkConfig.faucet) {
      const address = walletCtx.unshieldedKeystore.getBech32Address();
      console.log('  ⚠ Wallet has no tNight. Fund it from the faucet to send transactions:');
      console.log(`     ${networkConfig.faucet}`);
      console.log(`     Wallet address: ${address}\n`);
    }

    console.log('  Connecting to contract...');
    const providers = await createProviders(walletCtx);

    const deployed: any = await findDeployedContract(providers, {
      compiledContract: compiledContract as any,
      contractAddress: deployment.address,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
    });

    console.log('  ✅ Connected!\n');

    let running = true;
    while (running) {
      console.log('─── Menu ───────────────────────────────────────────────────────');
      console.log('  1. Fund the vault (lender)');
      console.log('  2. Execute a flash loan (borrow + arbitrage + repay)');
      console.log('  3. Withdraw profit (operator only)');
      console.log('  4. Read contract state');
      console.log('  5. Check wallet balance');
      console.log('  6. Exit\n');

      const choice = await rl.question('  Your choice: ');

      switch (choice.trim()) {
        case '1': {
          const amount = await rl.question('  Amount to lend: ');
          let amountN: bigint;
          try {
            amountN = toBigInt(amount, 'Amount');
          } catch (e: any) {
            console.log(`\n  ❌ ${e.message}\n`);
            break;
          }
          console.log('\n  Submitting transaction (this may take 30-60 seconds)...');
          try {
            const tx = await deployed.callTx.fund(amountN);
            console.log(`\n  ✅ Vault funded with ${fmt(amountN)}`);
            console.log(`  Transaction ID: ${tx.public.txId}`);
            console.log(`  Block height: ${tx.public.blockHeight}\n`);
          } catch (error) {
            console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error);
          }
          break;
        }

        case '2': {
          console.log('\n  ── Flash loan parameters ────────────────────────────────────');
          console.log('  borrowAmount  is derived: qty × buyPrice (you borrow exactly what');
          console.log('                your position costs — the contract enforces');
          console.log('                buySpend <= borrowAmount).');
          console.log('  pair          token pair, e.g. "WBTC-USDT" (public market info)');
          console.log('  buyPrice      what you pay per unit (PRIVATE — never on-chain)');
          console.log('  sellPrice     what you sell for per unit (PRIVATE — never on-chain)');
          console.log('  qty           units traded (PRIVATE — never on-chain)\n');
          const pair = (await rl.question('  pair: ')).trim();
          const buyPriceS = await rl.question('  buyPrice: ');
          const sellPriceS = await rl.question('  sellPrice: ');
          const qtyS = await rl.question('  qty: ');

          let buyPrice: bigint, sellPrice: bigint, qty: bigint;
          try {
            buyPrice = toBigInt(buyPriceS, 'buyPrice');
            sellPrice = toBigInt(sellPriceS, 'sellPrice');
            qty = toBigInt(qtyS, 'qty');
          } catch (e: any) {
            console.log(`\n  ❌ ${e.message}\n`);
            break;
          }

          if (!pair) {
            console.log('\n  ❌ pair cannot be empty\n');
            break;
          }

          const borrowAmount = qty * buyPrice;
          const p = previewTrade(borrowAmount, buyPrice, sellPrice, qty);
          console.log('\n  ── Trade preview (fee model = 0.1% base + 10% performance) ──');
          console.log(`  Borrow amount (qty × buyPrice): ${fmt(borrowAmount)}`);
          console.log(`  Buy spend (buyPrice × qty):   ${fmt(p.buySpend)}`);
          console.log(`  Sell proceeds (sellPrice × qty): ${fmt(p.sellProceeds)}`);
          console.log(`  Gross profit:                 ${fmt(p.profit)}`);
          console.log(`  Base fee (borrowAmount/1000): ${fmt(p.baseFee)}`);
          console.log(`  Performance fee (profit/10):  ${fmt(p.performanceFee)}`);
          console.log(`  Total fee:                    ${fmt(p.fee)}`);
          console.log(`  Operator takes:               ${fmt(p.fee)}  (10% perf + 0.1% base)`);
          console.log(`  Borrower keeps:               ${fmt(p.profit - p.fee)}`);

          const problems: string[] = [];
          if (p.buySpend > borrowAmount) problems.push(`buySpend ${fmt(p.buySpend)} exceeds borrowAmount ${fmt(borrowAmount)}`);
          if (p.profit < p.fee) problems.push(`profit ${fmt(p.profit)} does not cover fee ${fmt(p.fee)}`);
          if (p.sellProceeds < borrowAmount + p.fee) problems.push(`sellProceeds ${fmt(p.sellProceeds)} cannot repay borrowAmount + fee ${fmt(borrowAmount + p.fee)}`);
          const ledger = await readLedger(providers, deployment.address);
          if (ledger && borrowAmount > ledger.vaultBalance) {
            problems.push(`vaultBalance ${fmt(ledger.vaultBalance)} is less than the required borrow ${fmt(borrowAmount)}`);
          }
          if (problems.length > 0) {
            console.log('\n  ⚠  This trade will be REVERTED by the contract:');
            problems.forEach((m) => console.log(`     - ${m}`));
            console.log('     The whole transaction reverts — nothing is charged. This is the');
            console.log('     atomic repay-or-revert property of flash loans.\n');
            break;
          }

          const confirm = await rl.question('\n  Submit this trade? (y/N): ');
          if (confirm.trim().toLowerCase() !== 'y') {
            console.log('  Cancelled.\n');
            break;
          }

          console.log('\n  Submitting transaction (this may take 30-60 seconds)...');
          try {
            // Update the witnesses with THIS trade, then execute.
            witnessTrade = { buyPrice, sellPrice, qty };
            const tx = await deployed.callTx.executeFlashLoan(borrowAmount, pair);
            console.log(`\n  ✅ Flash loan repaid! The trade and the fee are settled atomically.`);
            console.log(`  Transaction ID: ${tx.public.txId}`);
            console.log(`  Block height: ${tx.public.blockHeight}\n`);
          } catch (error) {
            console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error);
          }
          break;
        }

        case '3': {
          const amount = await rl.question('  Amount to withdraw: ');
          let amountN: bigint;
          try {
            amountN = toBigInt(amount, 'Amount');
          } catch (e: any) {
            console.log(`\n  ❌ ${e.message}\n`);
            break;
          }
          console.log('\n  Submitting transaction (this may take 30-60 seconds)...');
          console.log('  ℹ  The circuit proves you know the operator secret whose');
          console.log('     commitment is stored on-chain — the secret itself never');
          console.log('     leaves this machine.\n');
          try {
            const tx = await deployed.callTx.withdrawProfit(amountN);
            console.log(`\n  ✅ Withdrew ${fmt(amountN)} from accrued profit`);
            console.log(`  Transaction ID: ${tx.public.txId}`);
            console.log(`  Block height: ${tx.public.blockHeight}\n`);
          } catch (error) {
            console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error);
          }
          break;
        }

        case '4': {
          console.log('\n  Reading contract state from blockchain...');
          try {
            const ledger = await readLedger(providers, deployment.address);
            if (!ledger) {
              console.log('\n  📋 No contract state found\n');
              break;
            }
            console.log('\n  ── Contract ledger (PUBLIC) ───────────────────────────────');
            console.log(`  vaultBalance:    ${fmt(ledger.vaultBalance)}   (liquidity available to borrow)`);
            console.log(`  profitBalance:   ${fmt(ledger.profitBalance)}   (accrued fees)`);
            console.log(`  loansCompleted:  ${fmt(ledger.loansCompleted)}`);
            console.log(`  totalBorrowed:   ${fmt(ledger.totalBorrowed)}`);
            console.log(`  lastPair:        ${ledger.lastPair}`);
            console.log(`  lastProfit:      ${fmt(ledger.lastProfit)}`);
            console.log(`  lastFee:         ${fmt(ledger.lastFee)}`);
            console.log(`  operator commit: ${Buffer.from(ledger.operator).toString('hex').slice(0, 16)}…`);
            console.log('  ── (prices, quantity and route of past trades are PRIVATE ────');
            console.log('     and never appear on-chain)────────────────────────────────\n');
          } catch (error) {
            console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error);
          }
          break;
        }

        case '5': {
          console.log('\n  Checking balance...');
          const currentState = await walletCtx.wallet.waitForSyncedState();
          const currentBalance = currentState.unshielded.balances[unshieldedToken().raw] ?? 0n;
          const dustBalance = currentState.dust.balance(new Date());
          console.log(`\n  tNight: ${fmt(currentBalance)}`);
          console.log(`  DUST: ${fmt(dustBalance)}\n`);
          break;
        }

        case '6':
          running = false;
          console.log('\n  👋 Goodbye!\n');
          break;

        default:
          console.log('\n  ❌ Invalid choice. Please enter 1-6.\n');
      }
    }

    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
