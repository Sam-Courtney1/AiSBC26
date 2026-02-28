import { SELECTORS, BUY_MACRO } from '../../shared/constants';
import { cancellableDelay, cancellableRandomDelay } from '../../utils/delay';
import { humanClick } from './domClicker';
import { pressKey } from './domClicker';
import { log } from '../../shared/logger';
import { getAbortSignal } from '../content';

// ========================================================================
//  PALETOOLS FILTER SELECTION
// ========================================================================

/**
 * Selects a paletools saved filter by name from the dropdown.
 * Clicks the dropdown container → finds matching item in the list → clicks it.
 */
export async function selectPaletoolsFilter(filterName: string): Promise<{ success: boolean; error?: string }> {
  const signal = getAbortSignal();
  try {
    const dropdown = document.querySelector(SELECTORS.PALETOOLS_FILTER_DROPDOWN) as HTMLElement | null;
    if (!dropdown) {
      return { success: false, error: 'Paletools filter dropdown not found' };
    }

    await humanClick(dropdown);
    await cancellableRandomDelay(300, 500, signal);

    const items = document.querySelectorAll(SELECTORS.PALETOOLS_FILTER_ITEM);
    for (const item of items) {
      const text = item.textContent?.trim().toLowerCase() ?? '';
      if (text === filterName.toLowerCase()) {
        await humanClick(item as HTMLElement);
        log(`Selected paletools filter: ${filterName}`);
        await cancellableRandomDelay(500, 800, signal);
        return { success: true };
      }
    }

    return { success: false, error: `Filter "${filterName}" not found in paletools list` };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { success: false, error: 'Aborted' };
    throw err;
  }
}

// ========================================================================
//  RESET — click Reset button to clear all filters before loading a new one
// ========================================================================

export async function clickResetButton(): Promise<{ success: boolean; error?: string }> {
  const signal = getAbortSignal();
  try {
    const buttons = document.querySelectorAll(SELECTORS.MARKET_RESET_BUTTON);
    for (const btn of buttons) {
      if (btn.textContent?.trim().toLowerCase() === 'reset') {
        await humanClick(btn as HTMLElement);
        log('Clicked Reset button');
        await cancellableDelay(800, signal);
        return { success: true };
      }
    }
    return { success: false, error: 'Reset button not found' };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { success: false, error: 'Aborted' };
    throw err;
  }
}

// ========================================================================
//  SEARCH — press "2" to execute the search after filters are set
// ========================================================================

export async function executeSearch(): Promise<void> {
  const signal = getAbortSignal();
  pressKey('2');
  log('Pressed "2" to search');
  await cancellableDelay(1500, signal);
}

// ========================================================================
//  PRICE SETTING — click increment button N times to set buy price
// ========================================================================

export async function setBuyPrice(clicks?: number): Promise<{ success: boolean; error?: string }> {
  const signal = getAbortSignal();
  try {
    const priceFilters = document.querySelectorAll(SELECTORS.PRICE_FILTER_BLOCK);
    if (priceFilters.length === 0) {
      return { success: false, error: 'No price filter blocks found' };
    }

    const buyNowMaxBlock = priceFilters[priceFilters.length - 1];
    if (!buyNowMaxBlock) {
      return { success: false, error: 'Buy Now Max price filter not found' };
    }

    const incrementBtn = buyNowMaxBlock.querySelector(SELECTORS.PRICE_INCREMENT_BUTTON) as HTMLElement | null;
    if (!incrementBtn) {
      return { success: false, error: 'Buy Now Max increment button not found' };
    }

    log(`Found Buy Now Max price filter (block ${priceFilters.length} of ${priceFilters.length})`);

    const numClicks = clicks ?? BUY_MACRO.PRICE_INCREMENT_RARE;
    for (let i = 0; i < numClicks; i++) {
      await humanClick(incrementBtn);
      await cancellableDelay(150, signal);
    }

    log(`Set buy price: ${numClicks} increments (${numClicks * 50} coins)`);
    await cancellableRandomDelay(200, 400, signal);
    return { success: true };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { success: false, error: 'Aborted' };
    throw err;
  }
}

// ========================================================================
//  COIN BALANCE — read from navbar for purchase verification
// ========================================================================

export function readCoinBalance(): number {
  const el = document.querySelector(SELECTORS.COIN_NAVBAR);
  if (!el) return -1;
  const text = el.textContent?.trim().replace(/,/g, '') ?? '';
  return parseInt(text, 10) || -1;
}

// ========================================================================
//  BUY MACRO — press "3" (search) + "ArrowDown" (buy) in a loop
// ========================================================================

let buyMacroActive = false;

export async function runBuyMacro(targetCount: number): Promise<{ purchased: number; coinsSpent: number }> {
  buyMacroActive = true;
  const signal = getAbortSignal();
  let purchased = 0;
  let coinsSpent = 0;
  let coinsBefore = readCoinBalance();

  log(`Starting buy macro — target: ${targetCount} players, coins: ${coinsBefore}`);

  const maxAttempts = targetCount * 3;

  try {
    for (let attempt = 0; attempt < maxAttempts && purchased < targetCount && buyMacroActive; attempt++) {
      if (signal.aborted) break;

      const prebuyCoinBalance = readCoinBalance();

      pressKey('3');
      await cancellableDelay(BUY_MACRO.SEARCH_TO_BUY_DELAY, signal);

      pressKeyRaw('ArrowDown', 'ArrowDown');

      const elapsed = BUY_MACRO.SEARCH_TO_BUY_DELAY;
      const remaining = BUY_MACRO.CYCLE_INTERVAL - elapsed;
      if (remaining > 0) {
        await cancellableDelay(remaining + Math.random() * 200 - 100, signal);
      }

      const postbuyCoinBalance = readCoinBalance();
      if (prebuyCoinBalance > 0 && postbuyCoinBalance > 0 && postbuyCoinBalance < prebuyCoinBalance) {
        const spent = prebuyCoinBalance - postbuyCoinBalance;
        purchased++;
        coinsSpent += spent;
        log(`Buy confirmed ${purchased}/${targetCount} — spent ${spent} coins (total: ${coinsSpent})`);
      } else {
        log(`Buy attempt ${attempt + 1} — no coin change (player may have been sold)`);
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      log('Buy macro aborted by kill switch');
    } else {
      throw err;
    }
  }

  buyMacroActive = false;
  const coinsAfter = readCoinBalance();
  log(`Buy macro complete — ${purchased}/${targetCount} purchased, ${coinsSpent} coins spent (balance: ${coinsAfter})`);
  return { purchased, coinsSpent };
}

export function stopBuyMacro(): void {
  buyMacroActive = false;
  log('Buy macro stopped');
}

// ========================================================================
//  HELPERS
// ========================================================================

function pressKeyRaw(key: string, code: string): void {
  let keyCode = 0;
  if (key === 'ArrowDown') keyCode = 40;
  else if (key === 'ArrowUp') keyCode = 38;
  else if (key.length === 1) keyCode = key.charCodeAt(0);

  const opts: KeyboardEventInit & { keyCode?: number; which?: number } = {
    key, code, bubbles: true, cancelable: true, keyCode, which: keyCode,
  };

  for (const target of [window, document, document.body]) {
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keypress', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
  }
}
