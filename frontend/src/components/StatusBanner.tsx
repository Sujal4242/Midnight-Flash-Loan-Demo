/**
 * Inline status banner. `submitting` renders in a neutral "in progress" style,
 * so a pending action is never mistaken for a success (the old UI showed the
 * green banner for every non-error state).
 */

import { AlertTriangle, Check } from './icons';

export type BannerStatus =
  | { kind: 'idle' }
  | { kind: 'submitting'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export function StatusBanner({ status }: { status: BannerStatus }) {
  if (status.kind === 'idle') return null;

  if (status.kind === 'submitting') {
    return (
      <div className="alert alert-progress" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>{status.message}</span>
      </div>
    );
  }

  if (status.kind === 'success') {
    return (
      <div className="alert alert-ok" role="status" aria-live="polite">
        <Check size={16} />
        <span>{status.message}</span>
      </div>
    );
  }

  return (
    <div className="alert alert-error" role="alert">
      <AlertTriangle size={16} />
      <span>{status.message}</span>
    </div>
  );
}
