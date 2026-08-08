// Centralised configuration. Every value can be overridden through a
// frontend/.env file (see .env.example). The defaults target the local
// devnet ("undeployed") used by the backend scripts (docker compose).
//
// IMPORTANT: these are PUBLIC settings — network endpoints and a contract
// address that is already visible on-chain. Never put secrets here.

const env = import.meta.env;

/** Bech32m / hex contract address deployed by `npm run deploy` (root). */
export const CONTRACT_ADDRESS: string =
  env.VITE_CONTRACT_ADDRESS ??
  '8d5ba05586f019e2d75d03ed2615254da219d30aa66c4835678968c7e6543446';

/** Network id passed to the wallet's connect(). Wallet-defined for non-mainnet. */
export const NETWORK_ID: string = env.VITE_NETWORK_ID ?? 'undeployed';

/**
 * Proof server used to generate ZK proofs when the wallet does not offer
 * delegated proving (`getProvingProvider`). The local devnet runs one on
 * http://localhost:6300 (see compose.yml).
 */
export const PROOF_SERVER_URL: string =
  env.VITE_PROOF_SERVER_URL ?? 'http://localhost:6300';

/**
 * Indexer endpoints, used to read the public contract state. When a wallet is
 * connected we prefer the wallet's own configuration; these are the fallback.
 */
export const INDEXER_URL: string =
  env.VITE_INDEXER_URL ?? 'http://127.0.0.1:8088/api/v4/graphql';
export const INDEXER_WS_URL: string =
  env.VITE_INDEXER_WS_URL ?? 'ws://127.0.0.1:8088/api/v4/graphql/ws';

/** How often (ms) the public ledger is re-polled through the indexer. */
export const LEDGER_POLL_MS: number = Number(env.VITE_LEDGER_POLL_MS ?? 5000);

/** Base URL under which the compiled ZK assets (zkir/keys) are served. */
export const ZK_ASSETS_BASE: string = `${window.location.origin}/midnight/flash-loan`;

/**
 * Optional block explorer template used to link transaction hashes. Leave
 * empty to hide explorer links. Use `{txId}` as the placeholder, e.g.
 * "https://explorer.example/transactions/{txId}".
 */
export const EXPLORER_URL: string = env.VITE_EXPLORER_URL ?? '';
