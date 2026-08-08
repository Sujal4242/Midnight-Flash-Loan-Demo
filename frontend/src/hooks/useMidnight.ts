/**
 * React hook that owns the wallet + contract session lifecycle:
 *
 *   findWallets → connect(networkId) → buildProviders → connectContract
 *
 * and exposes a live-polled view of the public ledger plus a connection
 * state machine (disconnected | connecting | connected | error).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { buildProviders } from '../midnight/providers';
import { connectContract, readLedger, type ContractSession } from '../midnight/contract-service';
import type { FlashLoanLedger } from '../midnight/types';
import { CONTRACT_ADDRESS, LEDGER_POLL_MS, NETWORK_ID } from '../config';

export type ConnectionStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected' }
  | { state: 'error'; message: string };

/** Locates the wallets exposing the DApp Connector API (window.midnight.*). */
export function findWallets(): InitialAPI[] {
  const midnight = (window as any).midnight as Record<string, InitialAPI> | undefined;
  if (!midnight) return [];
  return Object.values(midnight).filter(
    (candidate): candidate is InitialAPI =>
      typeof candidate === 'object' &&
      typeof candidate.name === 'string' &&
      typeof candidate.icon === 'string' &&
      typeof candidate.apiVersion === 'string' &&
      typeof candidate.connect === 'function',
  );
}

export function useMidnight() {
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'disconnected' });
  const [wallets, setWallets] = useState<InitialAPI[]>([]);
  const [ledger, setLedger] = useState<FlashLoanLedger | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const sessionRef = useRef<ContractSession | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    setWallets(findWallets());
  }, []);

  const refreshLedger = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const next = await readLedger(session.providers, session.contractAddress);
      setLedger(next);
      setLedgerError(null);
    } catch (err) {
      setLedgerError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const connect = useCallback(
    async (wallet: InitialAPI) => {
      setStatus({ state: 'connecting' });
      try {
        const connectedAPI = await wallet.connect(NETWORK_ID);
        const providers = await buildProviders(connectedAPI, NETWORK_ID);
        const session = await connectContract(providers, CONTRACT_ADDRESS);
        sessionRef.current = session;
        setStatus({ state: 'connected' });
        await refreshLedger();

        if (pollRef.current !== null) window.clearInterval(pollRef.current);
        pollRef.current = window.setInterval(refreshLedger, LEDGER_POLL_MS);
      } catch (err) {
        setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    },
    [refreshLedger],
  );

  const disconnect = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    sessionRef.current = null;
    setLedger(null);
    setLedgerError(null);
    setStatus({ state: 'disconnected' });
  }, []);

  useEffect(() => () => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
  }, []);

  return useMemo(
    () => ({
      status,
      wallets,
      ledger,
      ledgerError,
      session: sessionRef.current,
      connect,
      disconnect,
      refreshLedger,
    }),
    [status, wallets, ledger, ledgerError, connect, disconnect, refreshLedger],
  );
}
