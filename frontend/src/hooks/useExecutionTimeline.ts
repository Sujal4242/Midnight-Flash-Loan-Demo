/**
 * Simulated execution timeline. The contract call itself is a single awaited
 * promise, so the intermediate stages ("preparing → generating → signing →
 * submitting") are shown as a timed progress walk that resolves to "confirmed"
 * when the transaction lands, or resets on failure.
 */

import { useEffect, useRef, useState } from 'react';

export type TimelineStage = 'preparing' | 'generating' | 'signing' | 'submitting' | 'confirmed';

const STAGE_ORDER: TimelineStage[] = ['preparing', 'generating', 'signing', 'submitting'];
const STAGE_DURATION_MS = 1400;

export function useExecutionTimeline() {
  const [stage, setStage] = useState<TimelineStage | null>(null);
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  const start = () => {
    stop();
    setStage('preparing');
    let step = 0;
    timer.current = window.setInterval(() => {
      step += 1;
      setStage(STAGE_ORDER[Math.min(step, STAGE_ORDER.length - 1)]);
      if (step >= STAGE_ORDER.length - 1) stop();
    }, STAGE_DURATION_MS);
  };

  const confirm = () => {
    stop();
    setStage('confirmed');
  };

  const reset = () => {
    stop();
    setStage(null);
  };

  useEffect(() => stop, []);

  return { stage, start, confirm, reset };
}
