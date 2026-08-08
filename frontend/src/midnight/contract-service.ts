/**
 * Contract interaction layer.
 *
 * Mirrors the backend CLI (src/cli.ts) so the browser and the CLI stay
 * behaviourally equivalent:
 *
 *   - the compiled contract is bound to witnesses the same way (`CompiledContract.make`
 *     + `withWitnesses`); the browser variant skips `withCompiledFileAssets` because
 *     ZK artifacts are fetched over HTTP by `FetchZkConfigProvider`,
 *   - the private arbitrage trade travels ONLY through the `getTrade` witness —
 *     it is never written to the ledger,
 *   - `findDeployedContract` validates the on-chain verifier keys against the
 *     locally served assets before returning a call interface.
 */

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract, type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import { Contract, ledger } from './compiled-contract';
import type { BrowserProviders } from './providers';
import type { FlashLoanLedger, Trade } from './types';
import { CONTRACT_ADDRESS, NETWORK_ID } from '../config';
import { FLASH_LOAN_PRIVATE_STATE_ID } from './in-memory-private-state-provider';

// ─── Witness state ─────────────────────────────────────────────────────────────

// `getTrade` reads from this mutable holder; the UI sets it right before
// executing a flash loan. This is the ONLY place a trade strategy lives.
let witnessTrade: Trade = { buyPrice: 0n, sellPrice: 0n, qty: 0n };

// The operator secret whose commitment is stored on-chain belongs to whoever
// ran `npm run deploy`. A browser visitor does not hold it, so withdrawProfit
// is expected to fail for them (correct behaviour). The witness still needs a
// well-formed 32-byte value.
const browserOperatorSecret = crypto.getRandomValues(new Uint8Array(32));

// ─── Compiled contract ─────────────────────────────────────────────────────────

const CC: any = CompiledContract;
const compiledContract = CC.make('flash-loan', Contract).pipe(
  CC.withWitnesses({
    getTrade: (context: any) => [context.privateState, witnessTrade],
    getOperatorSecret: (context: any) => [context.privateState, browserOperatorSecret],
    divMod: (context: any, x: bigint, y: bigint) => [context.privateState, [x / y, x % y]],
  }),
);

// ─── Public API ────────────────────────────────────────────────────────────────

export interface ContractSession {
  providers: BrowserProviders;
  deployed: FoundContract<Contract>;
  contractAddress: string;
}

/** Connects the browser session to the already-deployed contract. */
export async function connectContract(
  providers: BrowserProviders,
  contractAddress: string = CONTRACT_ADDRESS,
): Promise<ContractSession> {
  const deployed = (await findDeployedContract(providers as any, {
    compiledContract: compiledContract as any,
    contractAddress,
    privateStateId: FLASH_LOAN_PRIVATE_STATE_ID,
    initialPrivateState: {},
  })) as FoundContract<Contract>;
  return { providers, deployed, contractAddress };
}

/** Decodes the current public ledger through the indexer. */
export async function readLedger(providers: BrowserProviders, contractAddress: string): Promise<FlashLoanLedger | null> {
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;
  const state = ledger(contractState.data);
  return {
    vaultBalance: state.vaultBalance,
    profitBalance: state.profitBalance,
    loansCompleted: state.loansCompleted,
    totalBorrowed: state.totalBorrowed,
    lastPair: state.lastPair,
    lastProfit: state.lastProfit,
    lastFee: state.lastFee,
    operator: state.operator,
  };
}

export interface TxResult {
  txId: string;
  blockHeight: number;
}

export async function fundVault(session: ContractSession, amount: bigint): Promise<TxResult> {
  const tx = await session.deployed.callTx.fund(amount);
  return { txId: tx.public.txId, blockHeight: tx.public.blockHeight };
}

/** Executes a flash loan with the given private trade. */
export async function executeFlashLoan(
  session: ContractSession,
  borrowAmount: bigint,
  pair: string,
  trade: Trade,
): Promise<TxResult> {
  witnessTrade = trade;
  const tx = await session.deployed.callTx.executeFlashLoan(borrowAmount, pair);
  return { txId: tx.public.txId, blockHeight: tx.public.blockHeight };
}

export async function withdrawProfit(session: ContractSession, amount: bigint): Promise<TxResult> {
  const tx = await session.deployed.callTx.withdrawProfit(amount);
  return { txId: tx.public.txId, blockHeight: tx.public.blockHeight };
}

/** Serialises a finalized transaction for display. */
export function describeTx(tx: unknown): string {
  try {
    const unbound = tx as UnboundTransaction;
    return `${unbound.identifiers()[0] ?? 'n/a'}`;
  } catch {
    return 'n/a';
  }
}

export const networkId = NETWORK_ID;
