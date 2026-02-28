import { log } from '../shared/logger';
import { startPageObserver, detectCurrentPage } from './observers/pageObserver';
import { readCoinBalance } from './dom/domReader';
import { triggerAutoSBC, submitSquad, isSubmitReady, resetAutoSBCGuard } from './dom/sbcPage';
import { pressKey } from './dom/domClicker';
import { selectPaletoolsFilter, runBuyMacro, stopBuyMacro, setBuyPrice, readCoinBalance as readNavbarCoins, clickResetButton, executeSearch } from './dom/marketBuyer';
import {
  navigateToNextIncomplete,
  navigateToSquadByIndex,
  navigateToSBCHub,
  navigateToTransferMarket,
  getLeagueSBCSquads,
  getSetProgress,
  getCurrentChallengeLeague,
} from './dom/navigation';

log('Content script loaded on EA FC web app');

// Start observing SPA page transitions
startPageObserver();
log(`Current page: ${detectCurrentPage()}`);

// ========================================================================
//  GLOBAL ABORT CONTROLLER — kill switch for all cancellable delays
// ========================================================================

let abortController = new AbortController();

/** Get the current abort signal — pass to cancellableDelay() */
export function getAbortSignal(): AbortSignal {
  return abortController.signal;
}

/** Abort all running operations instantly, then reset for next run */
export function triggerAbort(): void {
  abortController.abort();
  abortController = new AbortController();
}

// Listen for commands from the background service worker
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleCommand(msg).then(sendResponse);
  return true; // Required for async sendResponse
});

async function handleCommand(msg: { type: string; payload?: unknown }): Promise<unknown> {
  switch (msg.type) {
    case 'GET_COIN_BALANCE':
      return { success: true, payload: readCoinBalance() };

    case 'GET_CURRENT_PAGE':
      return { success: true, payload: detectCurrentPage() };

    case 'GET_LEAGUE_SQUADS':
      try {
        const squads = await getLeagueSBCSquads();
        return {
          success: true,
          payload: squads.map(s => ({ name: s.name, primaryLeague: s.primaryLeague, isComplete: s.isComplete })),
        };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }

    case 'GET_SET_PROGRESS':
      return { success: true, payload: getSetProgress() };

    case 'GET_CURRENT_LEAGUE':
      return { success: true, payload: getCurrentChallengeLeague() };

    case 'TRIGGER_AUTOSBC':
      try {
        const result = await triggerAutoSBC();
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }

    case 'SUBMIT_SQUAD':
      try {
        const result = await submitSquad();
        return { success: result.success, payload: result };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }

    case 'NAVIGATE_TO_SBC':
      try {
        await navigateToSBCHub();
        return { success: true };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }

    case 'CHECK_SUBMIT_READY':
      return { success: true, ready: isSubmitReady() };

    case 'PRESS_KEY':
      pressKey((msg.payload as { key: string }).key);
      return { success: true };

    case 'CLICK_BACK_BUTTON': {
      const { SELECTORS } = await import('../shared/constants');
      const { humanClick: click } = await import('./dom/domClicker');
      const backBtn = document.querySelector(SELECTORS.BACK_BUTTON) as HTMLElement | null;
      if (!backBtn) {
        return { success: false, error: 'Back button not found' };
      }
      await click(backBtn);
      return { success: true };
    }

    case 'NAVIGATE_TO_MARKET':
      try {
        const marketResult = await navigateToTransferMarket();
        return { success: marketResult.success, error: marketResult.error };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }

    case 'NAVIGATE_NEXT_SQUAD': {
      const navPayload = msg.payload as { index?: number; excludeLeagues?: string[] } | undefined;
      try {
        if (navPayload?.index !== undefined) {
          const result = await navigateToSquadByIndex(navPayload.index);
          return { success: result.success, payload: result };
        }
        const result = await navigateToNextIncomplete(navPayload?.excludeLeagues);
        return { success: result.success, payload: result };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }

    case 'SET_BUY_PRICE': {
      try {
        const pricePayload = msg.payload as { clicks?: number } | undefined;
        const result = await setBuyPrice(pricePayload?.clicks);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }

    case 'GET_NAVBAR_COINS':
      return { success: true, payload: readNavbarCoins() };

    case 'CLICK_RESET': {
      try {
        const result = await clickResetButton();
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }

    case 'EXECUTE_SEARCH':
      try {
        await executeSearch();
        return { success: true };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }

    case 'SELECT_PALETOOLS_FILTER': {
      const filterPayload = msg.payload as { filterName: string };
      try {
        const result = await selectPaletoolsFilter(filterPayload.filterName);
        return { success: result.success, error: result.error };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }

    case 'RUN_BUY_MACRO': {
      const buyPayload = msg.payload as { targetCount: number };
      try {
        const result = await runBuyMacro(buyPayload.targetCount);
        return { success: true, payload: result };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    }

    case 'STOP_BUY_MACRO':
      stopBuyMacro();
      return { success: true };

    case 'KILL':
      // Kill ALL running operations instantly
      triggerAbort();
      stopBuyMacro();
      resetAutoSBCGuard();
      log('KILL — all operations aborted');
      return { success: true };

    case 'CLICK_HOME': {
      const { SELECTORS } = await import('../shared/constants');
      const { humanClick: click } = await import('./dom/domClicker');
      const btn = document.querySelector(SELECTORS.NAV_HOME) as HTMLElement | null;
      if (!btn) return { success: false, error: 'Home button not found' };
      await click(btn);
      return { success: true };
    }

    case 'CLICK_SBC_TAB': {
      const { SELECTORS } = await import('../shared/constants');
      const { humanClick: click } = await import('./dom/domClicker');
      const btn = document.querySelector(SELECTORS.NAV_SBC_TAB) as HTMLElement | null;
      if (!btn) return { success: false, error: 'SBC tab button not found' };
      await click(btn);
      return { success: true };
    }

    case 'CLICK_UNASSIGNED_TILE': {
      const { SELECTORS } = await import('../shared/constants');
      const { humanClick: click } = await import('./dom/domClicker');
      const tile = document.querySelector(SELECTORS.UNASSIGNED_TILE) as HTMLElement | null;
      if (!tile) return { success: false, error: 'Unassigned Items tile not found' };
      await click(tile);
      return { success: true };
    }

    case 'CLICK_SEND_ALL_TO_CLUB': {
      const { SELECTORS } = await import('../shared/constants');
      const { humanClick: click } = await import('./dom/domClicker');
      const btn = document.querySelector(SELECTORS.SEND_ALL_TO_CLUB) as HTMLElement | null;
      if (!btn) return { success: false, error: 'Send All To Club button not found' };
      await click(btn);
      return { success: true };
    }

    case 'CLICK_ORGANIZE_UNASSIGNED': {
      const { SELECTORS } = await import('../shared/constants');
      const { humanClick: click } = await import('./dom/domClicker');
      const btn = document.querySelector(SELECTORS.ORGANIZE_UNASSIGNED) as HTMLElement | null;
      if (!btn) return { success: false, error: 'Organize Unassigned button not found' };
      await click(btn);
      return { success: true };
    }

    case 'CLICK_SBC_SET_TILE': {
      const { humanClick: click } = await import('./dom/domClicker');
      const payload = msg.payload as { title: string } | undefined;
      const title = payload?.title ?? 'Premium Mixed Leagues Upgrade';
      const allTitles = document.querySelectorAll('h1.tileTitle');
      for (const el of allTitles) {
        if (el.textContent?.trim() === title) {
          const tile = el.closest('.ut-set-tile-view') as HTMLElement | null ?? el.parentElement as HTMLElement | null;
          if (tile) { await click(tile); return { success: true }; }
          await click(el as HTMLElement);
          return { success: true };
        }
      }
      return { success: false, error: `SBC tile "${title}" not found` };
    }

    default:
      return { error: `Unknown command: ${msg.type}` };
  }
}
