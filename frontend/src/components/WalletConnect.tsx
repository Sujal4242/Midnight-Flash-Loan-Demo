/**
 * Wallet connection control for the nav bar. When connected it shows a status
 * chip plus a disconnect button; otherwise a dropdown lists the Midnight
 * wallets injected into `window.midnight` (DApp Connector API, e.g. 1AM/Lace).
 * The connection state machine comes from useMidnight.
 */

import { useEffect, useRef, useState } from 'react';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { ConnectionStatus } from '../hooks/useMidnight';
import { ChevronDown, Wallet } from './icons';

interface WalletConnectProps {
  status: ConnectionStatus;
  wallets: InitialAPI[];
  onConnect: (wallet: InitialAPI) => void;
  onDisconnect: () => void;
}

export function WalletConnect({ status, wallets, onConnect, onDisconnect }: WalletConnectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const busy = status.state === 'connecting';

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (status.state === 'connected') {
    return (
      <div className="wallet-connect connected">
        <span className="pill pill-ok">
          <span className="dot" /> Connected
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-connect" ref={rootRef}>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {busy ? (
          <>
            <span className="spinner spinner-sm" aria-hidden="true" />
            Connecting…
          </>
        ) : (
          <>
            <Wallet size={15} />
            Connect wallet
            <ChevronDown size={14} className={open ? 'chevron-open' : ''} />
          </>
        )}
      </button>

      {open && (
        <div className="wallet-menu" role="listbox" aria-label="Midnight wallets">
          {status.state === 'error' && (
            <div className="wallet-error" role="alert">
              Connection failed: {status.message}
            </div>
          )}
          {wallets.length === 0 ? (
            <div className="wallet-menu-empty">
              No Midnight wallet detected. Install 1AM (Midnight Network) or Lace, then reload this page.
            </div>
          ) : (
            wallets.map((wallet) => (
              <button
                key={wallet.rdns}
                className="wallet-row"
                role="option"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onConnect(wallet);
                }}
              >
                <img className="wallet-icon" src={wallet.icon} alt="" />
                <span className="wallet-name">{wallet.name}</span>
                <span className="wallet-meta">{wallet.apiVersion}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
