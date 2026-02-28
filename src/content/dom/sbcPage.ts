import { SELECTORS } from '../../shared/constants';
import { cancellableDelay, cancellableRandomDelay } from '../../utils/delay';
import {
  waitForElement,
  waitForLoadingComplete,
  elementExists,
} from './domReader';
import { humanClick } from './domClicker';
import { log } from '../../shared/logger';
import { getAbortSignal } from '../content';

// ========================================================================
//  AUTOSBC INTEGRATION — trigger AutoSBC to solve + fill the squad
// ========================================================================

// Guard: prevent double-pressing the AutoSBC button
let autoSBCInProgress = false;

/**
 * Triggers AutoSBC to auto-build the current squad.
 * 1. Clicks the AutoSBC button to open its panel
 * 2. Clicks the launch/build button to solve + fill
 * 3. Waits 5s for AutoSBC to finish building
 *
 * Protected by a double-press guard — calling while already running returns error.
 */
export async function triggerAutoSBC(): Promise<{ success: boolean; error?: string }> {
  // Double-press guard
  if (autoSBCInProgress) {
    log('AutoSBC already in progress — ignoring duplicate call');
    return { success: false, error: 'AutoSBC already in progress' };
  }

  autoSBCInProgress = true;
  const signal = getAbortSignal();

  try {
    // Step 1: Click the AutoSBC button ONCE to open the panel
    const autoSBCBtn = document.querySelector(SELECTORS.AUTOSBC_BUTTON) as HTMLElement | null;
    if (!autoSBCBtn) {
      return { success: false, error: 'AutoSBC button not found — is the AutoSBC extension installed?' };
    }

    await humanClick(autoSBCBtn);
    log('Clicked AutoSBC button — waiting 1s for panel...');

    await cancellableDelay(1000, signal);

    // Step 2: Click the build/launch button ONCE
    const launchBtn = document.querySelector(SELECTORS.AUTOSBC_LAUNCH) as HTMLElement | null;
    if (!launchBtn) {
      return { success: false, error: 'AutoSBC launch button not found after opening panel' };
    }

    await humanClick(launchBtn);
    log('Clicked AutoSBC build — waiting 5s for it to finish...');

    await cancellableDelay(5000, signal);

    log('AutoSBC build wait complete — proceeding to submit');
    return { success: true };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      log('AutoSBC trigger aborted by kill switch');
      return { success: false, error: 'Aborted' };
    }
    throw err;
  } finally {
    autoSBCInProgress = false;
  }
}

/** Reset the double-press guard (called on KILL) */
export function resetAutoSBCGuard(): void {
  autoSBCInProgress = false;
}

// ========================================================================
//  SQUAD SUBMISSION
// ========================================================================

/**
 * Submits the completed squad.
 * Waits for the submit button to become enabled, then clicks
 * submit → confirm → dismiss reward.
 */
export async function submitSquad(): Promise<{ success: boolean; error?: string }> {
  const signal = getAbortSignal();

  try {
    // Wait for submit button to become enabled
    const maxWaitMs = 10000;
    const pollInterval = 300;
    let waited = 0;
    let submitBtn: HTMLElement | null = null;

    while (waited < maxWaitMs) {
      submitBtn = findSubmitButton();
      if (!submitBtn) {
        return { success: false, error: 'Submit button not found in DOM' };
      }

      const parentBtn = submitBtn.closest('button') ?? submitBtn.parentElement;
      const isDisabled = parentBtn?.classList.contains('disabled') ?? false;
      if (!isDisabled) break;

      await cancellableDelay(pollInterval, signal);
      waited += pollInterval;
    }

    if (!submitBtn) {
      return { success: false, error: 'Submit button still disabled — requirements may not be met' };
    }

    // Final disabled check on parent
    const parentBtn = submitBtn.closest('button') ?? submitBtn.parentElement;
    if (parentBtn?.classList.contains('disabled')) {
      return { success: false, error: 'Submit button still disabled — requirements may not be met' };
    }

    log(`Clicking submit: tag=${submitBtn.tagName}, classes=${submitBtn.className}`);
    clickWithFullEventChain(submitBtn);

    await cancellableRandomDelay(2000, 3000, signal);

    // Confirm / Claim Rewards — find by text to avoid clicking wrong .btn-standard.primary
    const claimBtn = await waitForClaimButton(5000, signal);
    if (!claimBtn) {
      return { success: false, error: 'Claim Rewards button not found' };
    }

    log(`Clicking Claim Rewards: tag=${claimBtn.tagName}, text=${claimBtn.textContent?.trim()}`);
    clickWithFullEventChain(claimBtn);

    await waitForLoadingComplete();
    await cancellableRandomDelay(1000, 1500, signal);

    // Check for reward screen and dismiss
    if (elementExists(SELECTORS.REWARD_SCREEN)) {
      await dismissRewardScreen(signal);
    }

    // Second Claim Rewards click — needed when completing 4/4 (set rewards)
    await cancellableRandomDelay(3000, 4000, signal);
    const secondClaimBtn = await waitForClaimButton(3000, signal);
    if (secondClaimBtn) {
      log(`Clicking second Claim Rewards: ${secondClaimBtn.textContent?.trim()}`);
      clickWithFullEventChain(secondClaimBtn);
      await waitForLoadingComplete();
      await cancellableRandomDelay(1000, 1500, signal);

      // Dismiss second reward screen if present
      if (elementExists(SELECTORS.REWARD_SCREEN)) {
        await dismissRewardScreen(signal);
      }
    }

    return { success: true };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      log('Submit aborted by kill switch');
      return { success: false, error: 'Aborted' };
    }
    throw err;
  }
}

/**
 * Waits for the "Claim Rewards" (or similar confirm) button to appear.
 * Searches all `.btn-standard.primary` buttons for one with matching text.
 */
async function waitForClaimButton(timeout: number, signal: AbortSignal): Promise<HTMLElement | null> {
  const pollInterval = 200;
  let waited = 0;

  // Only match buttons with safe text — NEVER click unknown .btn-standard.primary buttons
  const SAFE_TEXTS = ['claim', 'confirm', 'ok', 'collect'];
  const BLOCKED_TEXTS = ['squad builder', 'store', 'buy', 'search'];

  while (waited < timeout) {
    const buttons = document.querySelectorAll(SELECTORS.CONFIRM_BUTTON);
    for (const btn of buttons) {
      const text = btn.textContent?.trim().toLowerCase() ?? '';
      // Skip blocked buttons
      if (BLOCKED_TEXTS.some(b => text.includes(b))) continue;
      // Only return buttons with safe text
      if (SAFE_TEXTS.some(s => text.includes(s))) {
        return btn as HTMLElement;
      }
    }
    await cancellableDelay(pollInterval, signal);
    waited += pollInterval;
  }

  // No safe button found — return null (do NOT fallback to any .btn-standard.primary)
  return null;
}

/**
 * Clicks an element with the full pointer + mouse + native event chain.
 * EA's framework may listen on any of these event types.
 */
function clickWithFullEventChain(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };

  el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1 }));
  el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1 }));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
  el.click();
}

/**
 * Checks whether the submit button exists and is NOT disabled.
 * Used to determine if the squad has enough valid players to submit.
 */
export function isSubmitReady(): boolean {
  const btn = findSubmitButton();
  if (!btn) return false;
  const parentBtn = btn.closest('button') ?? btn.parentElement;
  return !(parentBtn?.classList.contains('disabled') ?? true);
}

/**
 * Finds the actual Submit button by looking for the one containing "Submit" text.
 * There are multiple .ut-squad-tab-button-control buttons (bench tab, submit tab),
 * so we can't just querySelector the first one.
 */
function findSubmitButton(): HTMLElement | null {
  // Find the <span>Submit</span>, then return its parent <button>.
  // This ensures we get the correct button (not the bench tab).
  const allSpans = document.querySelectorAll('.ut-squad-tab-button-control span');
  for (const span of allSpans) {
    if (span.textContent?.trim().toLowerCase() === 'submit') {
      const btn = span.closest('button') as HTMLElement | null;
      return btn ?? span as HTMLElement;
    }
  }
  return null;
}

/**
 * Auto-dismisses the reward/pack reveal screen after submission.
 */
async function dismissRewardScreen(signal: AbortSignal): Promise<void> {
  await cancellableRandomDelay(600, 1000, signal);
  const dismissBtn = document.querySelector(SELECTORS.REWARD_DISMISS) as HTMLElement | null;
  if (dismissBtn) {
    await humanClick(dismissBtn);
    await waitForLoadingComplete();
  }
}
