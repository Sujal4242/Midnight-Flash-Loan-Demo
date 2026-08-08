/**
 * Display helpers for bigints, tx ids and timestamps. Pure formatting only —
 * no business logic lives here.
 */

/** 1 tNIGHT in base units. */
export const WEI = 1_000_000_000_000_000_000n;

/** Grouped, locale-formatted rendering of a bigint (e.g. 1,234,567). */
export function fmt(n: bigint): string {
  return n.toLocaleString('en-US');
}

/** Shortens a tx id for compact display: `abcdef1234…89abcd`. */
export function txShort(txId: string, head = 10, tail = 6): string {
  if (txId.length <= head + tail + 1) return txId;
  return `${txId.slice(0, head)}…${txId.slice(-tail)}`;
}

/** Human-friendly elapsed time (e.g. "3m ago") from an epoch-ms timestamp. */
export function timeAgo(at: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
