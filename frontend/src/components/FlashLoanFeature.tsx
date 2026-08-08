/**
 * Dashboard orchestrator. Owns the session activity log and wires the four
 * panels together. All contract interaction lives inside the panels (which
 * call the unchanged contract-service functions); nothing here touches the
 * Midnight integration or the trade witness.
 */

import { useCallback, useState } from 'react';
import type { ContractSession, TxResult } from '../midnight/contract-service';
import type { FlashLoanLedger } from '../midnight/types';
import { BorrowPanel } from './BorrowPanel';
import { FundPanel } from './FundPanel';
import { VaultPanel } from './VaultPanel';
import { ActivityPanel, type ActivityItem } from './ActivityPanel';

interface FlashLoanFeatureProps {
  session: ContractSession;
  ledger: FlashLoanLedger | null;
  onLedgerChanged: () => void;
}

const MAX_ACTIVITY_ITEMS = 8;

export function FlashLoanFeature({ session, ledger, onLedgerChanged }: FlashLoanFeatureProps) {
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const recordActivity = useCallback((item: Omit<ActivityItem, 'id' | 'at'>) => {
    setActivity((prev) =>
      [{ id: crypto.randomUUID(), at: Date.now(), ...item }, ...prev].slice(0, MAX_ACTIVITY_ITEMS),
    );
  }, []);

  const handleFunded = useCallback(
    (result: TxResult, amount: bigint) => {
      recordActivity({
        type: 'fund',
        label: 'Vault funded',
        amount,
        txId: result.txId,
        blockHeight: result.blockHeight,
      });
      onLedgerChanged();
    },
    [recordActivity, onLedgerChanged],
  );

  const handleLoan = useCallback(
    (result: TxResult, borrow: bigint, pair: string) => {
      recordActivity({
        type: 'loan',
        label: `Flash loan ${pair}`,
        amount: borrow,
        txId: result.txId,
        blockHeight: result.blockHeight,
      });
      onLedgerChanged();
    },
    [recordActivity, onLedgerChanged],
  );

  return (
    <div className="dashboard-grid">
      <div className="col-primary">
        <BorrowPanel session={session} ledger={ledger} onDone={handleLoan} />
      </div>
      <div className="col-secondary">
        <VaultPanel ledger={ledger} onRefresh={onLedgerChanged} />
        <FundPanel session={session} onDone={handleFunded} />
        <ActivityPanel items={activity} />
      </div>
    </div>
  );
}
