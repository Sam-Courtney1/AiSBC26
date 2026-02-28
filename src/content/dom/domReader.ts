import { SELECTORS } from '../../shared/constants';

/**
 * Waits for an element to appear in the DOM using MutationObserver.
 * Event-driven — much more efficient than polling with setInterval.
 * Essential because the EA web app renders asynchronously after API calls.
 */
export function waitForElement(
  selector: string,
  timeout: number = 10000
): Promise<HTMLElement> {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing as HTMLElement);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for: ${selector}`));
    }, timeout);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el as HTMLElement);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Waits for ALL elements matching a selector to appear (minimum count).
 * Useful for waiting for search results or player card lists to populate.
 */
export function waitForElements(
  selector: string,
  minCount: number = 1,
  timeout: number = 10000
): Promise<HTMLElement[]> {
  const existing = document.querySelectorAll(selector);
  if (existing.length >= minCount) {
    return Promise.resolve(Array.from(existing) as HTMLElement[]);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      // Resolve with whatever we have instead of rejecting,
      // since partial results can still be useful
      const current = document.querySelectorAll(selector);
      if (current.length > 0) {
        resolve(Array.from(current) as HTMLElement[]);
      } else {
        reject(new Error(`Timeout waiting for ${minCount}x: ${selector}`));
      }
    }, timeout);

    const observer = new MutationObserver(() => {
      const els = document.querySelectorAll(selector);
      if (els.length >= minCount) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(Array.from(els) as HTMLElement[]);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Waits for loading spinners to disappear.
 * Many EA actions show a spinner while fetching data.
 * Resolves immediately if no spinner is present.
 */
export function waitForLoadingComplete(timeout: number = 15000): Promise<void> {
  const spinner = document.querySelector(SELECTORS.LOADING_SPINNER);
  if (!spinner) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Loading spinner timeout'));
    }, timeout);

    const observer = new MutationObserver(() => {
      if (!document.querySelector(SELECTORS.LOADING_SPINNER)) {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Waits for any modal/dialog overlay to disappear.
 * Useful after dismissing confirmations or error dialogs.
 */
export function waitForDialogDismiss(timeout: number = 5000): Promise<void> {
  const dialog = document.querySelector(SELECTORS.DIALOG_OVERLAY);
  if (!dialog) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Dialog dismiss timeout'));
    }, timeout);

    const observer = new MutationObserver(() => {
      if (!document.querySelector(SELECTORS.DIALOG_OVERLAY)) {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/** Read trimmed text content from a single element. Returns null if not found. */
export function readText(selector: string): string | null {
  return document.querySelector(selector)?.textContent?.trim() ?? null;
}

/** Read trimmed text from all matching elements. Filters out empty strings. */
export function readAllText(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector))
    .map(el => el.textContent?.trim() ?? '')
    .filter(Boolean);
}

/** Read the user's current coin balance from the header. Returns 0 if unreadable. */
export function readCoinBalance(): number {
  const text = readText(SELECTORS.COIN_BALANCE);
  if (!text) return 0;
  return parseCoinValue(text);
}

/**
 * Parses coin display text into a number.
 * Handles commas (1,500), K suffix (1.5K), M suffix (1.2M).
 */
export function parseCoinValue(text: string): number {
  const cleaned = text.replace(/,/g, '').replace(/\s/g, '');
  if (cleaned.toUpperCase().endsWith('K')) return Math.round(parseFloat(cleaned) * 1000);
  if (cleaned.toUpperCase().endsWith('M')) return Math.round(parseFloat(cleaned) * 1000000);
  return parseInt(cleaned, 10) || 0;
}

/**
 * Checks if an element exists in the DOM right now (no waiting).
 * Useful for quick state checks without the overhead of observers.
 */
export function elementExists(selector: string): boolean {
  return document.querySelector(selector) !== null;
}

/**
 * Try primary selector, fall back to secondary. Returns null if neither found.
 */
export function safeQuery(primary: string, fallback: string): HTMLElement | null {
  return (document.querySelector(primary) ?? document.querySelector(fallback)) as HTMLElement | null;
}
