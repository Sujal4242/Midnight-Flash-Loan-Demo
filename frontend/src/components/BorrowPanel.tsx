/**
 * Execute a flash loan (borrower role). The trade is entered client-side,
 * validated against the contract's own fee model and assertion set (see
 * src/midnight/trade-preview.ts), then passed ONLY through the getTrade
 * witness. Prices, quantity and route are never written to the ledger.
 *
 * Business logic and contract calls are unchanged — this is a presentation
 * layer redesign (preview flow, execution timeline, success card).
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { ContractSession, TxResult } from '../midnight/contract-service';
import { executeFlashLoan } from '../midnight/contract-service';
import {
  deriveBorrowAmount,
  previewTrade,
  validateTrade,
  type TradePreview,
} from '../midnight/trade-preview';
import type { FlashLoanLedger } from '../midnight/types';
import { fmt, txShort } from '../format';
import { StatusBanner, type BannerStatus } from './StatusBanner';
import { useExecutionTimeline, type TimelineStage } from '../hooks/useExecutionTimeline';
import { EXPLORER_URL } from '../config';
import { AlertTriangle, ArrowDown, Bolt, Check, ExternalLink, Lock } from './icons';

interface BorrowPanelProps {
  session: ContractSession;
  ledger: FlashLoanLedger | null;
  onDone: (result: TxResult, borrow: bigint, pair: string) => void;
}

interface LoanSuccess {
  txId: string;
  blockHeight: number;
  pair: string;
  borrow: bigint;
  profit: bigint;
  fee: bigint;
  kept: bigint;
}

function Flow({ borrow, preview }: { borrow: bigint; preview: TradePreview }) {
  const steps: { label: string; value: string }[] = [
    { label: 'Borrow', value: fmt(borrow) },
    { label: 'Buy spend', value: fmt(preview.buySpend) },
    { label: 'Sell proceeds', value: fmt(preview.sellProceeds) },
    { label: 'Gross profit', value: fmt(preview.profit) },
    { label: 'Fee', value: fmt(preview.fee) },
    { label: 'You keep', value: fmt(preview.profit - preview.fee) },
  ];
  const nodes: ReactNode[] = [];
  steps.forEach((step, i) => {
    nodes.push(
      <div className="flow-node" key={step.label}>
        <span className="flow-label">{step.label}</span>
        <span className="flow-value">{step.value}</span>
      </div>,
    );
    if (i < steps.length - 1) {
      nodes.push(<ArrowDown key={`arrow-${i}`} className="flow-arrow" size={14} />);
    }
  });
  return <div className="flow">{nodes}</div>;
}

const TIMELINE_STEPS: { key: TimelineStage; label: string }[] = [
  { key: 'preparing', label: 'Preparing' },
  { key: 'generating', label: 'Generating proof' },
  { key: 'signing', label: 'Signing' },
  { key: 'submitting', label: 'Submitting' },
  { key: 'confirmed', label: 'Confirmed' },
];

function Timeline({ stage }: { stage: TimelineStage | null }) {
  if (!stage) return null;
  const activeIndex =
    stage === 'confirmed' ? TIMELINE_STEPS.length : TIMELINE_STEPS.findIndex((s) => s.key === stage);
  return (
    <div className="timeline" role="status" aria-live="polite">
      <div className="timeline-track">
        {TIMELINE_STEPS.map((step, i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
          return (
            <div className={`timeline-step ${state}`} key={step.key}>
              <span className="timeline-dot">
                {state === 'done' ? (
                  <Check size={11} />
                ) : state === 'active' ? (
                  <span className="spinner spinner-sm" aria-hidden="true" />
                ) : null}
              </span>
              <span className="timeline-label">{step.label}</span>
            </div>
          );
        })}
      </div>
      <div className="progress" aria-hidden="true">
        <div
          className="progress-bar"
          style={{ width: `${((activeIndex + 1) / TIMELINE_STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function SuccessCard({ success }: { success: LoanSuccess }) {
  const href = EXPLORER_URL ? EXPLORER_URL.replace('{txId}', success.txId) : null;
  return (
    <div className="success-card" role="status">
      <div className="success-head">
        <span className="success-check">
          <Check size={16} />
        </span>
        <div>
          <h4>Loan repaid atomically</h4>
          <p>
            block {success.blockHeight} · {txShort(success.txId)}
          </p>
        </div>
      </div>
      <dl className="success-grid">
        <div>
          <dt>Borrowed</dt>
          <dd>{fmt(success.borrow)}</dd>
        </div>
        <div>
          <dt>Gross profit</dt>
          <dd>{fmt(success.profit)}</dd>
        </div>
        <div>
          <dt>Fees</dt>
          <dd>{fmt(success.fee)}</dd>
        </div>
        <div>
          <dt>You kept</dt>
          <dd className="pos">{fmt(success.kept)}</dd>
        </div>
      </dl>
      {href && (
        <a className="btn btn-ghost btn-sm" href={href} target="_blank" rel="noreferrer">
          View on explorer <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

export function BorrowPanel({ session, ledger, onDone }: BorrowPanelProps) {
  const [pair, setPair] = useState('WBTC-USDT');
  const [buyPrice, setBuyPrice] = useState('10');
  const [sellPrice, setSellPrice] = useState('12');
  const [qty, setQty] = useState('100');
  const [derivedBorrow, setDerivedBorrow] = useState<bigint | null>(null);
  const [preview, setPreview] = useState<TradePreview | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<BannerStatus>({ kind: 'idle' });
  const [success, setSuccess] = useState<LoanSuccess | null>(null);
  const { stage, start, confirm, reset } = useExecutionTimeline();

  function recompute() {
    try {
      const buy = BigInt(buyPrice.trim() || '0');
      const sell = BigInt(sellPrice.trim() || '0');
      const qtyN = BigInt(qty.trim() || '0');
      const borrow = deriveBorrowAmount(qtyN, buy);
      setDerivedBorrow(borrow);
      setPreview(previewTrade(borrow, buy, sell, qtyN));
      const problems = validateTrade(borrow, { buyPrice: buy, sellPrice: sell, qty: qtyN });
      if (ledger && borrow > ledger.vaultBalance) {
        problems.push(
          `vaultBalance (${fmt(ledger.vaultBalance)}) is less than the required borrow (${fmt(borrow)}) — fund the vault first`,
        );
      }
      setProblems(problems);
    } catch {
      setDerivedBorrow(null);
      setPreview(null);
      setProblems([]);
    }
  }

  // Recompute on mount, on trade input changes, and whenever the on-chain vault
  // balance refreshes (the vault liquidity check depends on it).
  useEffect(() => {
    recompute();
  }, [buyPrice, sellPrice, qty, ledger]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    let buy: bigint;
    let sell: bigint;
    let qtyN: bigint;
    try {
      buy = BigInt(buyPrice.trim());
      sell = BigInt(sellPrice.trim());
      qtyN = BigInt(qty.trim());
    } catch {
      setStatus({ kind: 'error', message: 'Enter valid integer amounts for buyPrice, sellPrice and qty.' });
      return;
    }
    const borrow = deriveBorrowAmount(qtyN, buy);
    const trade = { buyPrice: buy, sellPrice: sell, qty: qtyN };
    const currentProblems = validateTrade(borrow, trade);
    if (ledger && borrow > ledger.vaultBalance) {
      currentProblems.push(
        `vaultBalance (${fmt(ledger.vaultBalance)}) is less than the required borrow (${fmt(borrow)}) — fund the vault first`,
      );
    }
    if (currentProblems.length > 0) {
      setProblems(currentProblems);
      setStatus({ kind: 'error', message: `Trade validation failed: ${currentProblems.join(' · ')}` });
      return;
    }
    setSuccess(null);
    setProblems([]);
    setStatus({ kind: 'submitting', message: 'Executing flash loan — proving the trade privately, then balancing in the wallet…' });
    start();
    try {
      const result = await executeFlashLoan(session, borrow, pair.trim(), trade);
      const p = previewTrade(borrow, buy, sell, qtyN);
      setSuccess({
        txId: result.txId,
        blockHeight: result.blockHeight,
        pair: pair.trim(),
        borrow,
        profit: p.profit,
        fee: p.fee,
        kept: p.profit - p.fee,
      });
      confirm();
      setStatus({
        kind: 'success',
        message: `Flash loan repaid atomically — borrowed ${fmt(borrow)}, kept ${fmt(p.profit - p.fee)} after fees · block ${result.blockHeight}`,
      });
      onDone(result, borrow, pair.trim());
    } catch (err) {
      reset();
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title-row">
          <span className="panel-icon">
            <Bolt size={16} />
          </span>
          <h3 className="panel-title">Execute flash loan</h3>
        </div>
        <span className="chip chip-private">
          <Lock size={11} /> private witness
        </span>
      </div>
      <p className="panel-sub">
        Borrow without collateral, arbitrage and repay inside one transaction. Your trade is a private
        witness — the chain only ever sees the disclosed profit and fee.
      </p>

      <form className="borrow-form" onSubmit={onSubmit}>
        <div className="field-grid">
          <label className="field field-span">
            <span className="field-label">
              Pair <em>public</em>
            </span>
            <input type="text" value={pair} onChange={(e) => setPair(e.target.value)} spellCheck={false} />
          </label>
          <label className="field field-span">
            <span className="field-label">
              Borrow amount <em>derived</em>
            </span>
            <span className="field-readonly">
              <Lock size={13} />
              <input type="text" value={derivedBorrow === null ? '—' : fmt(derivedBorrow)} readOnly aria-readonly="true" />
            </span>
          </label>
          <label className="field">
            <span className="field-label">
              Buy price <em>private</em>
            </span>
            <input type="number" min="1" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">
              Sell price <em>private</em>
            </span>
            <input type="number" min="1" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">
              Quantity <em>private</em>
            </span>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
        </div>

        {preview && (
          <div className="flow-wrap">
            <p className="flow-title">Trade preview — fee model 0.1% base + 10% performance</p>
            <Flow borrow={derivedBorrow ?? 0n} preview={preview} />
          </div>
        )}

        {problems.length > 0 ? (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={16} />
            <div>
              <strong>This trade will be reverted by the contract:</strong>
              <ul>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <span className="alert-foot">Nothing is charged — that is the atomic repay-or-revert property of flash loans.</span>
            </div>
          </div>
        ) : preview ? (
          <div className="alert alert-ok">
            <Check size={16} />
            <span>Trade is valid — submit to settle it atomically on-chain.</span>
          </div>
        ) : null}

        <button
          className="btn btn-primary btn-block"
          type="submit"
          disabled={status.kind === 'submitting' || problems.length > 0 || preview === null}
        >
          {status.kind === 'submitting' ? 'Executing…' : 'Execute flash loan'}
        </button>
        <p className="hint hint-center">
          borrowAmount = qty × buyPrice, so the trade can never spend more than it borrows — the contract
          enforces buySpend ≤ borrowAmount.
        </p>
      </form>

      <Timeline stage={stage} />
      <StatusBanner status={status} />
      {success && <SuccessCard success={success} />}
    </section>
  );
}
