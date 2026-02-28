import type { PageType } from '../../shared/types';
import { log } from '../../shared/logger';

/**
 * Detects which page/view is currently active in the EA FC SPA.
 * Checks for distinctive container elements that each view renders.
 */
export function detectCurrentPage(): PageType {
  if (document.querySelector('.ut-squad-building-sets-view')) return 'sbc_hub';
  if (document.querySelector('.ut-squad-building-set-view')) return 'sbc_set';
  if (document.querySelector('.ut-squad-building-challenge-view')) return 'sbc_challenge';
  if (document.querySelector('.ut-squad-building-squad-view')) return 'sbc_squad';
  if (document.querySelector('.ut-transfer-market-search-view')) return 'transfer_search';
  if (document.querySelector('.ut-transfer-list-view')) return 'transfer_results';
  if (document.querySelector('.ut-club-hub-view')) return 'club';
  return 'unknown';
}

/**
 * Watches for SPA page transitions using MutationObserver.
 * Since the EA web app is a React SPA, URL changes don't trigger page reloads —
 * React swaps component trees instead. This observer detects those swaps
 * and notifies the background service worker whenever the active view changes.
 *
 * Returns a disconnect function to stop observing.
 */
export function startPageObserver(): () => void {
  let lastPage: PageType = detectCurrentPage();
  log(`Initial page detected: ${lastPage}`);

  const observer = new MutationObserver(() => {
    const currentPage = detectCurrentPage();
    if (currentPage !== lastPage) {
      lastPage = currentPage;
      log(`Page changed: ${currentPage}`);
      chrome.runtime.sendMessage({
        type: 'PAGE_CHANGED',
        payload: { page: currentPage },
      }).catch(() => {
        // Background may not be listening yet — safe to ignore
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}
