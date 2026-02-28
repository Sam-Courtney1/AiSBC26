import type { SpeedMode } from '../shared/types';
import { TIMING } from '../shared/constants';

/**
 * Waits for a random duration between min and max milliseconds.
 * Uses Box-Muller normal distribution to cluster delays near the center
 * of the range, avoiding robotic fixed-interval patterns.
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const u1 = Math.random();
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  const center = (minMs + maxMs) / 2;
  const range = (maxMs - minMs) / 2;
  const delay = Math.max(minMs, Math.min(maxMs, center + normal * range * 0.3));

  return new Promise(resolve => setTimeout(resolve, Math.round(delay)));
}

/** Delay between individual actions (clicking, typing) */
export function actionDelay(speed: SpeedMode): Promise<void> {
  const t = TIMING[speed];
  return randomDelay(t.actionMin, t.actionMax);
}

/** Delay between logical steps (after filling a slot, before the next) */
export function betweenDelay(speed: SpeedMode): Promise<void> {
  const t = TIMING[speed];
  return randomDelay(t.betweenMin, t.betweenMax);
}

/** Delay during page navigation transitions */
export function navigationDelay(speed: SpeedMode): Promise<void> {
  const t = TIMING[speed];
  return randomDelay(t.navigationMin, t.navigationMax);
}

/**
 * Occasionally inserts a longer "thinking" pause to appear more human.
 * Call this periodically (e.g., every 5-10 actions). Has a 1-in-chance
 * probability of actually pausing; otherwise resolves immediately.
 */
export function maybeThinkingPause(chance: number = 6): Promise<void> {
  if (Math.floor(Math.random() * chance) === 0) {
    return randomDelay(5000, 15000);
  }
  return Promise.resolve();
}

/**
 * Cancellable delay — resolves after `ms` milliseconds unless the AbortSignal fires.
 * When aborted, the timer is cleared and the promise rejects with AbortError.
 * Use this for all waits that should be interruptible by the kill switch.
 */
export function cancellableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Cancellable random delay — same as randomDelay but abortable.
 */
export function cancellableRandomDelay(minMs: number, maxMs: number, signal: AbortSignal): Promise<void> {
  const u1 = Math.random();
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const center = (minMs + maxMs) / 2;
  const range = (maxMs - minMs) / 2;
  const ms = Math.max(minMs, Math.min(maxMs, center + normal * range * 0.3));
  return cancellableDelay(Math.round(ms), signal);
}
