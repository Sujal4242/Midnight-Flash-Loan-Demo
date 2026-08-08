/**
 * Live view of the PUBLIC flash-loan ledger. Everything shown here is on-chain;
 * the private trade witness never appears. Refreshes through the same indexer
 * polling that `useMidnight` drives.
 */

import { useState } from 'react';
import type { FlashLoanLedger } from '../midnight/types';
import { fmt } from '../format';
import { RefreshCw, ShieldCheck } from './icons';

interface VaultPanelProps {
  ledger: FlashLoanLedger | null;
  onRefresh: () => void;
}

function operatorShort(operator: Uint8Array): string {
  const bytes = Array.from(operator)
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${bytes}…`;
}

export function VaultPanel({ ledger, onRefresh }: VaultPanelProps) {
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-row">
        <div className="panel-title-row">
          <span className="panel-icon panel-icon-muted">
            <ShieldCheck size={16} />
          </span>
          <h3 className="panel-title">Vault</h3>
        </div>
        <button className="icon-btn" onClick={refresh} aria-label="Refresh ledger" title="Refresh ledger">
          <span className={refreshing ? 'spin' : ''}>
            <RefreshCw size={15} />
          </span>
        </button>
      </div>

      {ledger ? (
        <>
          <div className="vault-hero">
            <div>
              <span className="vault-hero-label">Available liquidity</span>
              <div className="vault-hero-value">{fmt(ledger.vaultBalance)}</div>
            </div>
            <span className="mono-chip">{ledger.lastPair || '—'}</span>
          </div>

          <dl className="stat-grid">
            <div className="stat">
              <dt className="stat-label">profitBalance</dt>
              <dd className="stat-value pos">{fmt(ledger.profitBalance)}</dd>
            </div>
            <div className="stat">
              <dt className="stat-label">loansCompleted</dt>
              <dd className="stat-value">{fmt(ledger.loansCompleted)}</dd>
            </div>
            <div className="stat">
              <dt className="stat-label">totalBorrowed</dt>
              <dd className="stat-value">{fmt(ledger.totalBorrowed)}</dd>
            </div>
            <div className="stat">
              <dt className="stat-label">lastProfit</dt>
              <dd className="stat-value">{fmt(ledger.lastProfit)}</dd>
            </div>
            <div className="stat">
              <dt className="stat-label">lastFee</dt>
              <dd className="stat-value">{fmt(ledger.lastFee)}</dd>
            </div>
            <div className="stat">
              <dt className="stat-label">operator</dt>
              <dd className="stat-value">{operatorShort(ledger.operator)}</dd>
            </div>
          </dl>

          <p className="hint">Everything on this panel is public. Your prices, quantity and route never appear on-chain.</p>
        </>
      ) : (
        <p className="activity-empty">No contract state found at the configured address.</p>
      )}
    </section>
  );
}
