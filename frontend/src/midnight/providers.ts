/**
 * Provider assembly for the browser.
 *
 * Bridges the seven Midnight providers into one object that
 * `findDeployedContract` / `callTx` consume:
 *
 *  - privateStateProvider  — in-memory (nothing persisted)
 *  - publicDataProvider    — wallet's indexer endpoints
 *  - zkConfigProvider      — fetches .bzkir / .prover / .verifier assets
 *                            served under /midnight/flash-loan
 *  - proofProvider         — the wallet's proof server (or configured fallback)
 *  - walletProvider        — wallet: public keys + balanceTx
 *  - midnightProvider      — wallet: submitTx
 *
 * Public keys: the DApp Connector API returns Bech32m-encoded keys. These are
 * used verbatim — the ledger treats a coin/encryption public key as an opaque
 * string (see dev.to guide "Building a Shielded Token dApp on Midnight",
 * 1AM wallet docs) and the indexer/network resolves them the same way.
 */

import type {
  CoinPublicKey,
  EncPublicKey,
  FinalizedTransaction,
} from '@midnight-ntwrk/ledger-v8';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import type {
  ConnectedAPI,
} from '@midnight-ntwrk/dapp-connector-api';
import type {
  MidnightProviders,
  PublicDataProvider,
  UnboundTransaction,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { InMemoryPrivateStateProvider } from './in-memory-private-state-provider';
import { INDEXER_URL, INDEXER_WS_URL, PROOF_SERVER_URL, ZK_ASSETS_BASE } from '../config';

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const matches = cleaned.match(/.{1,2}/g) ?? [];
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

export interface BrowserProviders extends MidnightProviders<'fund' | 'executeFlashLoan' | 'withdrawProfit', string, unknown> {
  publicDataProvider: PublicDataProvider;
}

/** Builds all providers from an already-connected wallet. */
export async function buildProviders(connectedAPI: ConnectedAPI, networkId: string): Promise<BrowserProviders> {
  setNetworkId(networkId);

  const config = await connectedAPI.getConfiguration();
  const shielded = await connectedAPI.getShieldedAddresses();

  // The wallet's own endpoints are authoritative for the user's chosen network.
  // Falls back to the configured local devnet defaults when absent.
  const indexerUrl = config.indexerUri || INDEXER_URL;
  const indexerWsUrl = config.indexerWsUri || INDEXER_WS_URL;
  const proofServerUrl = config.proverServerUri || PROOF_SERVER_URL;

  const zkConfigProvider = new FetchZkConfigProvider<'fund' | 'executeFlashLoan' | 'withdrawProfit'>(
    ZK_ASSETS_BASE,
    window.fetch.bind(window),
  );
  const publicDataProvider = indexerPublicDataProvider(indexerUrl, indexerWsUrl);

  const walletProvider: WalletProvider = {
    getCoinPublicKey(): CoinPublicKey {
      return shielded.shieldedCoinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return shielded.shieldedEncryptionPublicKey;
    },
    async balanceTx(tx: UnboundTransaction, _ttl?: Date): Promise<FinalizedTransaction> {
      const serialized = tx.serialize();
      const result = await connectedAPI.balanceUnsealedTransaction(uint8ArrayToHex(serialized));
      const deserialized = Transaction.deserialize(
        'signature',
        'proof',
        'binding',
        hexToUint8Array(result.tx),
      ) as FinalizedTransaction;
      return deserialized;
    },
  };

  return {
    privateStateProvider: new InMemoryPrivateStateProvider(),
    publicDataProvider,
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofServerUrl, zkConfigProvider),
    walletProvider,
    midnightProvider: {
      async submitTx(tx) {
        const serialized = tx.serialize();
        await connectedAPI.submitTransaction(uint8ArrayToHex(serialized));
        return tx.identifiers()[0];
      },
    },
  };
}
