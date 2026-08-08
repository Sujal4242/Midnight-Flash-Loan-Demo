/**
 * Fund the vault (lender role). Calls the same `fundVault` contract path as
 * before — only the presentation changed.
 */

import { useState, type FormEvent } from 'react';
import type { ContractSession, TxResult } from '../midnight/contract-service';
import { fundVault } from '../midnight/contract-service';
import { WEI, fmt, txShort } from '../format';
import { StatusBanner, type BannerStatus } from './StatusBanner';
import { Plus } from './icons';

interface FundPanelProps {
  session: ContractSession;
  onDone: (result: TxResult, amount: bigint) => void;
}

export function FundPanel({ session, onDone }: FundPanelProps) {
  const [amount, setAmount] = useState('1000000'); // 0.000001 tNIGHT default
  const [status, setStatus] = useState<BannerStatus>({ kind: 'idle' });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    let value: bigint;
    try {
      value = BigInt(amount.trim() || '0');
    } catch {
      setStatus({ kind: 'error', message: 'Amount must be a whole number of tNIGHT units.' });
      return;
    }
    if (value <= 0n) {
      setStatus({ kind: 'error', message: 'Amount must be greater than zero.' });
      return;
    }
    setStatus({ kind: 'submitting', message: 'Funding the vault — the wallet is balancing and signing the transaction…' });
    try {
      const result = await fundVault(session, value);
      setStatus({
        kind: 'success',
        message: `Vault funded with ${fmt(value)}. Block ${result.blockHeight} · tx ${txShort(result.txId)}.`,
      });
      onDone(result, value);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <section className="panel">
      <div className="panel-row">
        <div className="panel-title-row">
          <span className="panel-icon panel-icon-muted">
            <Plus size={16} />
          </span>
          <h3 className="panel-title">Fund the vault</h3>
        </div>
        <span className="chip chip-private">lender</span>
      </div>
      <p className="panel-sub">Add liquidity to the pool that flash loans are borrowed from.</p>

      <form className="fund-form" onSubmit={onSubmit}>
        <div className="fund-form-row">
          <label className="field field-grow">
            <span className="field-label">
              Amount <em>tNIGHT units</em>
            </span>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000000" />
          </label>
          <button className="btn btn-primary" type="submit" disabled={status.kind === 'submitting'}>
            {status.kind === 'submitting' ? 'Funding…' : 'Fund vault'}
          </button>
        </div>
      </form>

      <p className="hint">
        1 tNIGHT = {fmt(WEI)} units. Example: 1,000,000 units ≈ 0.000001 tNIGHT.
      </p>

      <StatusBanner status={status} />
    </section>
  );
}
