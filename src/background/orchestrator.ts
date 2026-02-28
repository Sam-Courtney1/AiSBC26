import type {
  OrchestratorState,
  OrchestratorStatus,
  UserConfig,
  LogEntry,
} from '../shared/types';
import { createLogEntry, log, logWarn, logError } from '../shared/logger';
import { LEAGUE_BUY_COUNTS, PALETOOLS_FILTERS, BUY_MACRO } from '../shared/constants';

// ========================================================================
//  CONSTANTS
// ========================================================================

const STORAGE_KEY = 'orchestratorState';
const MAX_LOGS = 50;

// ========================================================================
//  SIMPLIFIED STATE
// ========================================================================

/**
 * With AutoSBC handling solving + filling, the orchestrator is much simpler.
 * Flow: idle → filling_squad (AutoSBC) → submitting → advancing_to_next → loop
 */

interface SimpleState {
  status: OrchestratorStatus;
  currentSquadIndex: number;
  totalSquads: number;
  completedSquads: number;
  currentRepeat: number;
  totalRepeats: number;
  totalCoinsSpent: number;
  config: UserConfig;
  logs: LogEntry[];
  lastError: string | null;
  pausedAt: OrchestratorStatus | null;
  // League tracking — which leagues are done in the current cycle
  completedLeagues: string[];
  allLeagues: string[];
  currentLeague: string | null;
  // Single-pass tracking — skip leagues where submit is disabled, then go to market
  skippedLeagues: string[];
  attemptedLeagues: string[];
  // Team counting — how many incomplete squads existed when we started this pass
  totalIncompleteAtStart: number;
  // Buy queue — list of { filterName, targetCount, priceClicks } to process on the transfer market
  buyQueue: { filterName: string; targetCount: number; priceClicks: number }[];
  buyQueueIndex: number;
}

function createDefaultState(config?: Partial<UserConfig>): SimpleState {
  const defaults: UserConfig = {
    maxPricePerPlayer: 1500,
    totalBudget: 50000,
    reserveCoins: 5000,
    speedMode: 'normal',
    repeatCount: 1,
    preferUntradeable: true,
    skipExpensiveSquads: true,
    autoCollectRewards: true,
    maxConsecutiveErrors: 3,
    pauseOnLowCoins: true,
  };

  return {
    status: 'idle',
    currentSquadIndex: 0,
    totalSquads: 0,
    completedSquads: 0,
    currentRepeat: 0,
    totalRepeats: 1,
    totalCoinsSpent: 0,
    config: { ...defaults, ...config },
    logs: [],
    lastError: null,
    pausedAt: null,
    completedLeagues: [],
    allLeagues: [],
    currentLeague: null,
    skippedLeagues: [],
    attemptedLeagues: [],
    totalIncompleteAtStart: 0,
    buyQueue: [],
    buyQueueIndex: 0,
  };
}

// ========================================================================
//  STATE PERSISTENCE
// ========================================================================

let state: SimpleState = createDefaultState();

async function saveState(): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } catch (err) {
    logError(`Failed to save state: ${(err as Error).message}`);
  }
}

async function loadState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      const saved = result[STORAGE_KEY] as Partial<SimpleState>;
      // Merge with defaults so old saved states get new fields
      state = { ...createDefaultState(), ...saved };
      // Ensure arrays are never undefined (old state won't have them)
      state.completedLeagues = state.completedLeagues ?? [];
      state.allLeagues = state.allLeagues ?? [];
      state.currentLeague = state.currentLeague ?? null;
      state.skippedLeagues = state.skippedLeagues ?? [];
      state.attemptedLeagues = state.attemptedLeagues ?? [];
      state.totalIncompleteAtStart = state.totalIncompleteAtStart ?? 0;
      state.buyQueue = state.buyQueue ?? [];
      state.buyQueueIndex = state.buyQueueIndex ?? 0;
      log(`Restored state: ${state.status}`);
    }
  } catch (err) {
    logError(`Failed to load state: ${(err as Error).message}`);
  }
}

// ========================================================================
//  LOGGING + BROADCAST
// ========================================================================

function addLog(level: LogEntry['level'], message: string): void {
  const entry = createLogEntry(level, message);
  state.logs.unshift(entry);
  if (state.logs.length > MAX_LOGS) state.logs.length = MAX_LOGS;

  chrome.runtime.sendMessage({ type: 'LOG_ENTRY', payload: entry }).catch(() => {});

  if (level === 'error') logError(message);
  else if (level === 'warn') logWarn(message);
  else log(message);
}

function broadcastStatus(): void {
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    payload: {
      status: state.status,
      completedSquads: state.completedSquads,
      totalSquads: state.totalSquads,
      totalCoinsSpent: state.totalCoinsSpent,
      currentRepeat: state.currentRepeat,
      totalRepeats: state.totalRepeats,
      completedLeagues: state.completedLeagues,
      currentLeague: state.currentLeague,
      error: state.lastError ?? undefined,
    },
  }).catch(() => {});
}

// ========================================================================
//  CONTENT SCRIPT MESSAGING
// ========================================================================

async function sendToContent<T = unknown>(msg: { type: string; payload?: unknown }): Promise<T> {
  const tabs = await chrome.tabs.query({ url: '*://*.ea.com/*' });
  const tab = tabs[0];
  if (!tab?.id) throw new Error('EA FC web app tab not found');
  return chrome.tabs.sendMessage(tab.id, msg) as Promise<T>;
}

// ========================================================================
//  STATE TRANSITIONS + ERRORS
// ========================================================================

async function transition(newStatus: OrchestratorStatus): Promise<void> {
  const prev = state.status;
  state.status = newStatus;
  await saveState();
  broadcastStatus();
  log(`State: ${prev} → ${newStatus}`);
}

let consecutiveErrors = 0;

async function handleError(message: string): Promise<void> {
  consecutiveErrors++;
  state.lastError = message;
  addLog('error', message);

  if (consecutiveErrors >= state.config.maxConsecutiveErrors) {
    addLog('error', `Pausing after ${consecutiveErrors} consecutive errors`);
    state.pausedAt = state.status;
    await transition('paused');
    consecutiveErrors = 0;
  }
}

function clearErrors(): void {
  consecutiveErrors = 0;
  state.lastError = null;
}

// Global abort flag — checked by all long-running loops
let aborted = false;

function isAborted(): boolean {
  return aborted || state.status === 'idle' || state.status === 'paused' ||
         state.status === 'complete' || state.status === 'error';
}

// ========================================================================
//  HELPERS
// ========================================================================

/**
 * Navigates back to the overview screen using the back button, with key "1" as fallback.
 * Verifies we actually got back by checking for challenge rows.
 */
async function navigateBackToOverview(): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (isAborted()) return;

    // Try 1: Click the back button (most reliable)
    if (attempt <= 2) {
      try {
        const backRes = await sendToContent<{ success: boolean; error?: string }>({
          type: 'CLICK_BACK_BUTTON',
        });
        if (backRes.success) {
          addLog('info', `Clicked back button (attempt ${attempt})`);
        } else {
          addLog('warn', `Back button not found — trying key "1" instead`);
          await sendToContent({ type: 'PRESS_KEY', payload: { key: '1' } });
        }
      } catch {
        await sendToContent({ type: 'PRESS_KEY', payload: { key: '1' } });
      }
    } else {
      // Last attempt: try key "1"
      await sendToContent({ type: 'PRESS_KEY', payload: { key: '1' } });
      addLog('info', `Pressed key "1" (attempt ${attempt})`);
    }

    // Wait for page to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (isAborted()) return;

    // Verify we're on the overview by checking for challenge rows
    try {
      const squadsRes = await sendToContent<{
        success: boolean;
        payload?: { name: string; primaryLeague: string; isComplete: boolean }[];
      }>({ type: 'GET_LEAGUE_SQUADS' });

      if (squadsRes.success && squadsRes.payload && squadsRes.payload.length > 0) {
        addLog('info', `Back on overview — ${squadsRes.payload.length} squads visible`);
        return;
      }
    } catch { /* ignore, retry */ }

    addLog('warn', `Overview not visible after attempt ${attempt}, retrying...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  addLog('warn', 'Could not verify overview after 3 attempts — proceeding anyway');
}

// ========================================================================
//  ORCHESTRATOR STEPS — simplified with AutoSBC
//
//  Flow: filling_squad → submitting → advancing_to_next → (loop)
//
//  AutoSBC handles: solving, club scanning, player placement
//  We handle: triggering AutoSBC, submitting, navigating between squads
// ========================================================================

export async function processNextStep(): Promise<void> {
  // Loop through steps immediately — don't wait for the next alarm tick
  while (true) {
    if (state.status === 'idle' || state.status === 'paused' ||
        state.status === 'error' || state.status === 'complete') {
      return;
    }

    const prevStatus = state.status;

    try {
      switch (state.status) {
        case 'filling_squad':
          await stepTriggerAutoSBC();
          break;

        case 'submitting':
          await stepSubmit();
          break;

        case 'advancing_to_next':
          await stepAdvanceToNext();
          break;

        case 'navigating_to_market':
          await stepNavigateToMarket();
          break;

        case 'buying_player':
          await stepBuyPlayers();
          break;

        default:
          addLog('warn', `Unexpected state "${state.status}", resetting to filling_squad`);
          await transition('filling_squad');
          break;
      }
    } catch (err) {
      await handleError(`Step ${state.status} failed: ${(err as Error).message}`);
    }

    // If status didn't change, break to avoid infinite loop
    if (state.status === prevStatus) return;
  }
}

// ---- Step: Trigger AutoSBC to solve + fill ----

async function stepTriggerAutoSBC(): Promise<void> {
  addLog('info', 'Triggering AutoSBC to build squad...');

  const res = await sendToContent<{ success: boolean; error?: string }>({
    type: 'TRIGGER_AUTOSBC',
  });

  if (!res.success) {
    await handleError(`AutoSBC failed: ${res.error ?? 'unknown'}`);
    return;
  }

  addLog('success', 'AutoSBC filled the squad');
  clearErrors();
  await transition('submitting');
}

// ---- Step: Submit the filled squad ----

async function stepSubmit(): Promise<void> {
  // state.currentLeague is already set from the navigation step
  addLog('info', `Checking submit for${state.currentLeague ? ` [${state.currentLeague}]` : ''}...`);

  // Check if submit button is enabled before attempting
  const readyRes = await sendToContent<{ success: boolean; ready: boolean }>({
    type: 'CHECK_SUBMIT_READY',
  });

  if (!readyRes.ready) {
    // Not enough players — skip this league
    addLog('warn', `Skipping [${state.currentLeague ?? 'unknown'}] — submit not ready (not enough players)`);
    if (state.currentLeague && !state.skippedLeagues.includes(state.currentLeague)) {
      state.skippedLeagues.push(state.currentLeague);
    }

    // Press "1" to go back to the 4-tile overview screen, then verify we actually got back
    await navigateBackToOverview();

    clearErrors();
    await transition('advancing_to_next');
    return;
  }

  addLog('info', `Submitting squad [${state.currentLeague ?? 'unknown'}]...`);

  const res = await sendToContent<{
    success: boolean;
    payload?: { error?: string };
    error?: string;
  }>({
    type: 'SUBMIT_SQUAD',
  });

  if (!res.success) {
    const err = res.payload?.error ?? res.error ?? 'unknown';
    await handleError(`Submit failed: ${err}`);
    return;
  }

  // Track the completed league (don't increment completedSquads — let page counter be source of truth)
  if (state.currentLeague && !state.completedLeagues.includes(state.currentLeague)) {
    state.completedLeagues.push(state.currentLeague);
    addLog('success', `League completed: ${state.currentLeague}`);
  }

  addLog('success', `Squad submitted! [${state.currentLeague ?? 'unknown'}]`);
  clearErrors();
  await transition('advancing_to_next');
}

// ---- Step: Advance to next squad or repeat ----

async function stepAdvanceToNext(): Promise<void> {
  // ---- Check 1: Have we already visited all incomplete squads this pass? ----
  // If so, decide immediately without calling navigation (avoids unnecessary back button clicks).
  if (state.totalIncompleteAtStart > 0 && state.attemptedLeagues.length >= state.totalIncompleteAtStart) {
    addLog('info', `Visited all ${state.totalIncompleteAtStart} incomplete squads (attempted: ${state.attemptedLeagues.join(', ')})`);

    if (state.skippedLeagues.length > 0) {
      // Some squads couldn't be submitted — go buy players
      addLog('warn', `Need players for: ${state.skippedLeagues.join(', ')}`);
      await transition('navigating_to_market');
      return;
    }

    // All incomplete squads were submitted this pass — cycle complete
    state.currentRepeat++;
    addLog('success', `All squads submitted! Repeat ${state.currentRepeat}/${state.totalRepeats}`);
    addLog('info', `Leagues done this cycle: ${state.completedLeagues.join(', ')}`);

    // Reset tracking for next cycle
    state.completedLeagues = [];
    state.currentLeague = null;
    state.skippedLeagues = [];
    state.attemptedLeagues = [];
    state.totalIncompleteAtStart = 0;

    if (state.currentRepeat >= state.totalRepeats) {
      addLog('success', `All ${state.totalRepeats} repeats finished!`);
      await transition('complete');
      return;
    }

    // More repeats — navigate back to SBC for the next cycle
    addLog('info', `Starting repeat ${state.currentRepeat + 1}/${state.totalRepeats}...`);
    state.completedSquads = 0;
    clearErrors();
    await sendToContent({ type: 'NAVIGATE_TO_SBC' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await transition('advancing_to_next');
    return;
  }

  // ---- Check 2: Navigate to the next incomplete squad ----
  const res = await sendToContent<{
    success: boolean;
    payload?: {
      squadName: string;
      primaryLeague: string;
      remainingCount: number;
      totalCount: number;
      setProgress: { completed: number; total: number };
    };
    error?: string;
  }>({
    type: 'NAVIGATE_NEXT_SQUAD',
    payload: { excludeLeagues: state.attemptedLeagues },
  });

  // Extract progress from the navigation result (read while on overview)
  const setProgress = res.payload?.setProgress ?? { completed: 0, total: 0 };
  if (setProgress.total > 0) {
    state.completedSquads = setProgress.completed;
    state.totalSquads = setProgress.total;
  }

  addLog('info', `Page progress: ${setProgress.completed}/${setProgress.total}`);

  // Record totalIncompleteAtStart on first navigation of this pass
  if (state.totalIncompleteAtStart === 0 && res.payload) {
    // Use progress bar (total - completed) if available, otherwise use remainingCount
    // from the navigation result (count of incomplete rows on the overview page)
    const incompleteCount = setProgress.total > 0
      ? setProgress.total - setProgress.completed
      : res.payload.remainingCount;
    state.totalIncompleteAtStart = incompleteCount;
    addLog('info', `Recorded ${incompleteCount} incomplete squads at start of pass`);
  }

  // If all challenges in the set are done (4/4), this cycle is complete
  if (setProgress.completed >= setProgress.total && setProgress.total > 0) {
    state.currentRepeat++;
    addLog('success', `All ${setProgress.total} challenges complete! Repeat ${state.currentRepeat}/${state.totalRepeats}`);
    addLog('info', `Leagues done this cycle: ${state.completedLeagues.join(', ')}`);

    // Reset tracking for next cycle
    state.completedLeagues = [];
    state.currentLeague = null;
    state.skippedLeagues = [];
    state.attemptedLeagues = [];
    state.totalIncompleteAtStart = 0;

    if (state.currentRepeat >= state.totalRepeats) {
      addLog('success', `All ${state.totalRepeats} repeats finished!`);
      await transition('complete');
      return;
    }

    // More repeats — the set will auto-reset, navigate to first incomplete
    addLog('info', `Starting repeat ${state.currentRepeat + 1}/${state.totalRepeats}...`);
    state.completedSquads = 0;
    clearErrors();

    await sendToContent({ type: 'NAVIGATE_TO_SBC' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await transition('advancing_to_next');
    return;
  }

  // No more unattempted incomplete squads found
  if (!res.success || !res.payload) {
    // All visited but some were skipped — go to transfer market
    if (state.skippedLeagues.length > 0) {
      addLog('warn', `All squads visited — need players for: ${state.skippedLeagues.join(', ')}`);
      await transition('navigating_to_market');
      return;
    }

    // Check if set is actually complete via progress
    if (setProgress.completed >= setProgress.total && setProgress.total > 0) {
      addLog('info', 'All squads complete — treating as cycle done');
      state.currentRepeat++;
      state.completedLeagues = [];
      state.currentLeague = null;
      state.skippedLeagues = [];
      state.attemptedLeagues = [];
      state.totalIncompleteAtStart = 0;
      if (state.currentRepeat >= state.totalRepeats) {
        addLog('success', `All ${state.totalRepeats} repeats finished!`);
        await transition('complete');
        return;
      }
      state.completedSquads = 0;
      clearErrors();
      await sendToContent({ type: 'NAVIGATE_TO_SBC' });
      await transition('advancing_to_next');
      return;
    }

    await handleError('No incomplete squads found but set not fully complete');
    return;
  }

  // ---- Found a squad — track it and fill ----
  state.currentLeague = res.payload.primaryLeague;
  if (!state.attemptedLeagues.includes(res.payload.primaryLeague)) {
    state.attemptedLeagues.push(res.payload.primaryLeague);
  }
  addLog('info', `Next squad: ${res.payload.squadName} [${res.payload.primaryLeague}] (${res.payload.remainingCount} remaining, visited ${state.attemptedLeagues.length}/${state.totalIncompleteAtStart})`);
  clearErrors();
  await transition('filling_squad');
}

// ---- Step: Navigate to Transfer Market (when leagues were skipped) ----

async function stepNavigateToMarket(): Promise<void> {
  addLog('info', `Navigating to Transfer Market — need players for: ${state.skippedLeagues.join(', ')}`);

  const res = await sendToContent<{ success: boolean; error?: string }>({
    type: 'NAVIGATE_TO_MARKET',
  });

  if (!res.success) {
    await handleError(`Failed to navigate to market: ${res.error ?? 'unknown'}`);
    return;
  }

  // Build buy queue from skipped leagues
  state.buyQueue = [];
  state.buyQueueIndex = 0;

  for (const league of state.skippedLeagues) {
    const counts = LEAGUE_BUY_COUNTS[league];
    const filters = PALETOOLS_FILTERS[league];
    if (!counts || !filters) {
      addLog('warn', `No buy config for league: ${league} — skipping`);
      continue;
    }

    // Common gold first (4 clicks = 300 coins), then rare (5 clicks = 350 coins)
    if (counts.common > 0) {
      state.buyQueue.push({ filterName: filters.common, targetCount: counts.common, priceClicks: BUY_MACRO.PRICE_INCREMENT_COMMON });
    }
    if (counts.rare > 0) {
      state.buyQueue.push({ filterName: filters.rare, targetCount: counts.rare, priceClicks: BUY_MACRO.PRICE_INCREMENT_RARE });
    }
  }

  if (state.buyQueue.length === 0) {
    addLog('warn', 'No buy queue items — pausing');
    state.pausedAt = 'navigating_to_market';
    await transition('paused');
    return;
  }

  addLog('info', `Buy queue: ${state.buyQueue.map(q => `${q.filterName} x${q.targetCount}`).join(', ')}`);
  await transition('buying_player');
}

// ---- Step: Buy players using paletools filters + buy macro ----
// Processes ALL buy queue items in one call (each macro is long-running anyway).
//
// Per-filter flow: Reset → Select filter → Set price (5 increments) → Press "2" to search → Buy macro

async function stepBuyPlayers(): Promise<void> {
  // Process each item in the queue from the current index
  while (state.buyQueueIndex < state.buyQueue.length) {
    if (isAborted()) return;

    const current = state.buyQueue[state.buyQueueIndex]!;
    addLog('info', `Buying: ${current.filterName} x${current.targetCount} (${state.buyQueueIndex + 1}/${state.buyQueue.length})`);

    // Step 1: Click Reset to clear all previous filters (including price)
    const resetRes = await sendToContent<{ success: boolean; error?: string }>({
      type: 'CLICK_RESET',
    });

    if (!resetRes.success) {
      addLog('warn', `Reset failed: ${resetRes.error ?? 'unknown'} — continuing anyway`);
    }

    // Step 2: Select the paletools filter
    const filterRes = await sendToContent<{ success: boolean; error?: string }>({
      type: 'SELECT_PALETOOLS_FILTER',
      payload: { filterName: current.filterName },
    });

    if (!filterRes.success) {
      await handleError(`Filter selection failed: ${filterRes.error ?? 'unknown'}`);
      return;
    }

    // Step 3: Set the buy price (common = 4 clicks/300 coins, rare = 5 clicks/350 coins)
    const priceRes = await sendToContent<{ success: boolean; error?: string }>({
      type: 'SET_BUY_PRICE',
      payload: { clicks: current.priceClicks },
    });

    if (!priceRes.success) {
      addLog('warn', `Price setting failed: ${priceRes.error ?? 'unknown'} — continuing anyway`);
    }

    // Step 4: Press "2" to execute the search
    await sendToContent({ type: 'EXECUTE_SEARCH' });

    // Step 5: Run the buy macro for the target count (with coin verification)
    const buyRes = await sendToContent<{
      success: boolean;
      payload?: { purchased: number; coinsSpent: number };
      error?: string;
    }>({
      type: 'RUN_BUY_MACRO',
      payload: { targetCount: current.targetCount },
    });

    if (!buyRes.success) {
      await handleError(`Buy macro failed: ${buyRes.error ?? 'unknown'}`);
      return;
    }

    const purchased = buyRes.payload?.purchased ?? 0;
    const coinsSpent = buyRes.payload?.coinsSpent ?? 0;
    state.totalCoinsSpent += coinsSpent;
    addLog('success', `Bought ${purchased}/${current.targetCount} for ${current.filterName} (${coinsSpent} coins)`);

    // Move to next item
    state.buyQueueIndex++;
    await saveState();

    // Press back button to return to the search page before next filter
    if (state.buyQueueIndex < state.buyQueue.length) {
      addLog('info', 'Pressing back to return to search page...');
      try {
        const backRes = await sendToContent<{ success: boolean }>({ type: 'CLICK_BACK_BUTTON' });
        if (!backRes.success) {
          await sendToContent({ type: 'PRESS_KEY', payload: { key: '1' } });
        }
      } catch {
        await sendToContent({ type: 'PRESS_KEY', payload: { key: '1' } });
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // All buying done — send players to club, then return to SBC
  addLog('success', 'All buy queue items complete — sending players to club');

  // Step A: Click Home
  if (isAborted()) return;
  await sendToContent({ type: 'CLICK_HOME' });
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Step B: Click Unassigned Items tile
  if (isAborted()) return;
  await sendToContent({ type: 'CLICK_UNASSIGNED_TILE' });
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Step C: Click "Send All To Club"
  if (isAborted()) return;
  await sendToContent({ type: 'CLICK_SEND_ALL_TO_CLUB' });
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Step D: Check for "Organize Unassigned" (untradeable duplicates)
  if (isAborted()) return;
  const organizeRes = await sendToContent<{ success: boolean }>({ type: 'CLICK_ORGANIZE_UNASSIGNED' });
  if (organizeRes.success) {
    addLog('info', 'Clicked Organize Unassigned — handling duplicates');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Step E: Click Home again
  if (isAborted()) return;
  await sendToContent({ type: 'CLICK_HOME' });
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Step F: Click SBC tab
  if (isAborted()) return;
  await sendToContent({ type: 'CLICK_SBC_TAB' });
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Step G: Click the "Premium Mixed Leagues Upgrade" tile to get back to the 4-squad overview
  if (isAborted()) return;
  await sendToContent({ type: 'CLICK_SBC_SET_TILE', payload: { title: 'Premium Mixed Leagues Upgrade' } });
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Reset buy state and tracking for retry pass
  state.buyQueue = [];
  state.buyQueueIndex = 0;
  state.skippedLeagues = [];
  state.attemptedLeagues = [];
  state.totalIncompleteAtStart = 0;

  clearErrors();
  await transition('advancing_to_next');
}

// ========================================================================
//  PUBLIC API
// ========================================================================

async function gatherInitialInfo(): Promise<void> {
  try {
    const pageRes = await sendToContent<{ success: boolean; payload: string }>({
      type: 'GET_CURRENT_PAGE',
    });
    addLog('info', `Current page: ${pageRes.payload}`);
  } catch { /* non-critical */ }

  // Read the actual X/4 progress counter
  try {
    const progressRes = await sendToContent<{ success: boolean; payload: { completed: number; total: number } }>({
      type: 'GET_SET_PROGRESS',
    });
    if (progressRes.success && progressRes.payload && progressRes.payload.total > 0) {
      state.completedSquads = progressRes.payload.completed;
      state.totalSquads = progressRes.payload.total;
      addLog('info', `Page progress: ${progressRes.payload.completed}/${progressRes.payload.total} completed`);
    }
  } catch { /* non-critical */ }

  try {
    const squadsRes = await sendToContent<{
      success: boolean;
      payload?: { name: string; primaryLeague: string; isComplete: boolean }[];
    }>({
      type: 'GET_LEAGUE_SQUADS',
    });
    if (squadsRes.success && squadsRes.payload) {
      state.totalSquads = squadsRes.payload.length;
      state.allLeagues = squadsRes.payload.map(s => s.primaryLeague);
      const completed = squadsRes.payload.filter(s => s.isComplete);
      const incomplete = squadsRes.payload.filter(s => !s.isComplete);

      // Sync with actual page state — count already-completed squads
      state.completedSquads = completed.length;

      // Mark already-completed leagues
      for (const s of completed) {
        if (!state.completedLeagues.includes(s.primaryLeague)) {
          state.completedLeagues.push(s.primaryLeague);
        }
      }

      // Record how many incomplete squads exist right now
      state.totalIncompleteAtStart = incomplete.length;

      addLog('info', `Found ${state.totalSquads} squads (${completed.length} done, ${incomplete.length} remaining)`);
      addLog('info', `Leagues: ${state.allLeagues.join(', ')}`);
      if (state.completedLeagues.length > 0) {
        addLog('info', `Already completed: ${state.completedLeagues.join(', ')}`);
      }
      await saveState();
    }
  } catch { /* will discover as we go */ }
}

export async function start(config: Partial<UserConfig>): Promise<void> {
  // Allow restart from any state except paused (use resume for that)
  if (state.status === 'paused') {
    addLog('warn', 'Cannot start — use resume instead');
    return;
  }

  aborted = false;
  state = createDefaultState(config);
  state.totalRepeats = config.repeatCount ?? 1;

  addLog('success', `Grind started — ${state.totalRepeats} repeat(s)`);

  // First step: navigate into the first incomplete challenge
  await transition('advancing_to_next');

  // Gather initial info in background, then kick off the first step
  gatherInitialInfo().catch(() => {}).finally(() => {
    processNextStep();
  });
}

export async function pause(): Promise<void> {
  if (state.status === 'idle' || state.status === 'paused' || state.status === 'complete') {
    return;
  }
  aborted = true;
  state.pausedAt = state.status;
  addLog('info', 'Pausing — killing ALL operations...');
  sendToContent({ type: 'KILL' }).catch(() => {});
  await transition('paused');
}

export async function resume(): Promise<void> {
  if (state.status !== 'paused') return;

  aborted = false;
  const resumeTo = state.pausedAt ?? 'filling_squad';
  state.pausedAt = null;
  addLog('info', `Resuming from ${resumeTo}`);
  await transition(resumeTo);
  await processNextStep();
}

export async function stop(): Promise<void> {
  aborted = true;
  addLog('info', 'Stopped — killing ALL operations...');
  sendToContent({ type: 'KILL' }).catch(() => {});
  state.pausedAt = null;
  await transition('idle');
}

export function getStatus(): {
  status: OrchestratorStatus;
  completedSquads: number;
  totalSquads: number;
  totalCoinsSpent: number;
  currentRepeat: number;
  totalRepeats: number;
  completedLeagues: string[];
  remainingLeagues: string[];
  currentLeague: string | null;
  logs: LogEntry[];
  error?: string;
} {
  const remainingLeagues = state.allLeagues.filter(l => !state.completedLeagues.includes(l));
  return {
    status: state.status,
    completedSquads: state.completedSquads,
    totalSquads: state.totalSquads,
    totalCoinsSpent: state.totalCoinsSpent,
    currentRepeat: state.currentRepeat,
    totalRepeats: state.totalRepeats,
    completedLeagues: state.completedLeagues,
    remainingLeagues,
    currentLeague: state.currentLeague,
    logs: state.logs,
    error: state.lastError ?? undefined,
  };
}

export function updateConfig(config: Partial<UserConfig>): void {
  state.config = { ...state.config, ...config };
  addLog('info', 'Config updated');
  saveState();
}

export async function init(): Promise<void> {
  await loadState();
  if (state.status !== 'idle' && state.status !== 'paused' &&
      state.status !== 'complete' && state.status !== 'error') {
    addLog('info', `Worker restarted — resuming from ${state.status}`);
  }
}
