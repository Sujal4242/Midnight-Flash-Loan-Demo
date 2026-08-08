/**
 * Recent on-chain activity (funds and loans) performed in this session.
 * Purely presentational — items are recorded by the orchestrator after each
 * successful transaction.
 */

import type { ReactNode } from 'react';
import { fmt, timeAgo, txShort } from '../format';
import { EXPLORER_URL } from '../config';
import { Activity, ExternalLink, Plus, TrendingUp } from './icons';

export interface ActivityItem {
  id: string;
  type: 'fund' | 'loan';
  label: string;
  amount: bigint;
  txId: string;
  blockHeight: number;
  at: number;
}

interface ActivityPanelProps {
  items: ActivityItem[];
}

const TYPE_ICON: Record<ActivityItem['type'], ReactNode> = {
  fund: <Plus size={15} />,
  loan: <TrendingUp size={15} />,
};

export function ActivityPanel({ items }: ActivityPanelProps) {
  return (
    <section className="panel">
      <div className="panel-row">
        <div className="panel-title-row">
          <span className="panel-icon panel-icon-muted">
            <Activity size={16} />
          </span>
          <h3 className="panel-title">Activity</h3>
        </div>
        {items.length > 0 && <span className="pill">{items.length}</span>}
      </div>

      {items.length === 0 ? (
        <p className="activity-empty">No activity yet — fund the vault or execute your first flash loan.</p>
      ) : (
        <ul className="activity">
          {items.map((item) => {
            const href = EXPLORER_URL ? EXPLORER_URL.replace('{txId}', item.txId) : null;
            return (
              <li className="activity-item" key={item.id}>
                <span className={`activity-icon ${item.type}`}>{TYPE_ICON[item.type]}</span>
                <div className="activity-main">
                  <div className="activity-title">
                    {item.label}
                    <span className="activity-amount">{fmt(item.amount)}</span>
                  </div>
                  <div className="activity-meta">
                    <span>#{item.blockHeight}</span>
                    <span>{txShort(item.txId)}</span>
                    <span>{timeAgo(item.at)}</span>
                    {href && (
                      <a href={href} target="_blank" rel="noreferrer">
                        explorer <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
