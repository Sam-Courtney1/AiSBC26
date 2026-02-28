import type { LeagueSBCSquad } from '../../shared/types';
import { SELECTORS, LEAGUE_MAP } from '../../shared/constants';
import { randomDelay } from '../../utils/delay';
import {
  waitForElement,
  waitForLoadingComplete,
  elementExists,
} from './domReader';
import { humanClick } from './domClicker';
import { log } from '../../shared/logger';

// ========================================================================
//  LEAGUE SBC NAVIGATION
// ========================================================================

/**
 * Gets all squad challenges in the current league SBC set.
 * Uses the real EA DOM: .ut-sbc-challenge-table-row-view rows.
 * A row with class "complete" means that challenge is done.
 */
export async function getLeagueSBCSquads(): Promise<LeagueSBCSquad[]> {
  const rows = document.querySelectorAll(SELECTORS.SBC_CHALLENGE_ROW);
  const squads: LeagueSBCSquad[] = [];

  for (const row of rows) {
    const name = row.querySelector(SELECTORS.SBC_CHALLENGE_ROW_TITLE)?.textContent?.trim() ?? '';
    const isComplete = row.classList.contains('complete');
    const primaryLeague = extractPrimaryLeague(name);
    squads.push({
      name,
      primaryLeague,
      isComplete,
      elementRef: row as HTMLElement,
    });
  }

  return squads;
}

/**
 * Extracts the primary league from a challenge title like "Liga Portugal & 1A Pro League".
 * Matches against LEAGUE_MAP keys (case-insensitive partial match on the first part before "&").
 */
function extractPrimaryLeague(title: string): string {
  const lower = title.toLowerCase();
  for (const [key, league] of Object.entries(LEAGUE_MAP)) {
    if (lower.includes(key)) return league;
  }
  // Fallback: use the part before "&"
  const parts = title.split('&');
  return parts[0]?.trim() ?? title;
}

/**
 * Reads the set-level progress ("2/4 Completed") from the overview page.
 */
export function getSetProgress(): { completed: number; total: number } {
  const labels = document.querySelectorAll(SELECTORS.SBC_PROGRESS_LABEL);
  for (const label of labels) {
    const text = label.textContent?.trim() ?? '';
    const match = text.match(/(\d+)\s*\/\s*(\d+)\s*completed/i);
    if (match) {
      return { completed: parseInt(match[1]!, 10), total: parseInt(match[2]!, 10) };
    }
  }
  return { completed: 0, total: 0 };
}

/**
 * Reads the current challenge's league from the h1.title inside a challenge page.
 */
export function getCurrentChallengeLeague(): string | null {
  const titleEl = document.querySelector(SELECTORS.SBC_CHALLENGE_TITLE_INSIDE);
  if (!titleEl) return null;
  const title = titleEl.textContent?.trim() ?? '';
  return extractPrimaryLeague(title);
}

/**
 * Finds and navigates to the next incomplete squad challenge.
 * If already inside a challenge, goes back to the set overview first.
 */
export async function navigateToNextIncomplete(excludeLeagues?: string[]): Promise<{
  success: boolean;
  squadName: string;
  primaryLeague: string;
  remainingCount: number;
  totalCount: number;
  setProgress: { completed: number; total: number };
}> {
  // Navigate back to the set overview if we're not there already.
  // After submit+claim, the page may need multiple back clicks or time to settle.
  let squads = await getLeagueSBCSquads();

  // Retry: click back up to 3 times to reach the overview with challenge rows
  for (let attempt = 0; attempt < 3 && squads.length === 0; attempt++) {
    const backBtn = document.querySelector(SELECTORS.BACK_BUTTON) as HTMLElement | null;
    if (backBtn) {
      log(`Back button click attempt ${attempt + 1}`);
      await humanClick(backBtn);
      await waitForLoadingComplete();
      await randomDelay(600, 1000);
    }
    squads = await getLeagueSBCSquads();
  }

  // Still no rows — wait a bit longer for page to settle and try once more
  if (squads.length === 0) {
    await randomDelay(2000, 3000);
    squads = await getLeagueSBCSquads();
  }

  // Wait for the page to settle so the progress bar and row classes are up-to-date
  await randomDelay(500, 800);
  // Re-read squads after settle (completion status may have updated)
  squads = await getLeagueSBCSquads();

  // Read progress NOW while we're on the overview page (before clicking into a challenge)
  const progress = getSetProgress();
  const completedCount = squads.filter(s => s.isComplete).length;

  // Filter out complete squads AND any leagues we've already attempted (skipped)
  const excluded = excludeLeagues ?? [];
  const incomplete = squads.filter(s => !s.isComplete && !excluded.includes(s.primaryLeague));
  const total = squads.length;

  log(`Found ${total} squads, ${incomplete.length} eligible (${excluded.length} excluded), page progress: ${progress.completed}/${progress.total}, completed rows: ${completedCount}`);

  // Use whichever gives us better data — the progress bar or the row classes
  const bestProgress = progress.total > 0
    ? progress
    : { completed: completedCount, total: total };

  if (incomplete.length === 0) {
    return {
      success: false, squadName: '', primaryLeague: '',
      remainingCount: 0, totalCount: total,
      setProgress: bestProgress,
    };
  }

  const next = incomplete[0]!;
  await humanClick(next.elementRef);
  await waitForLoadingComplete();
  await randomDelay(400, 800);

  // Poll for "Go to Challenge" or "Start Challenge" button (may take time to appear)
  let goBtn: HTMLElement | null = null;
  for (let attempt = 0; attempt < 10 && !goBtn; attempt++) {
    goBtn = findButtonByText('go to challenge') ?? findButtonByText('start challenge');
    if (!goBtn) {
      await randomDelay(300, 500);
    }
  }

  if (goBtn) {
    log(`Clicking: ${goBtn.textContent?.trim()}`);
    await humanClick(goBtn);
    await waitForLoadingComplete();
    await randomDelay(400, 800);
  } else {
    log('Warning: Go to Challenge / Start Challenge button not found — may already be inside challenge');
  }

  log(`Navigated to: ${next.name} [${next.primaryLeague}] (${incomplete.length} remaining)`);

  return {
    success: true,
    squadName: next.name,
    primaryLeague: next.primaryLeague,
    remainingCount: incomplete.length,
    totalCount: total,
    setProgress: bestProgress,
  };
}

/**
 * Navigates to a specific squad challenge by index.
 */
export async function navigateToSquadByIndex(index: number): Promise<{
  success: boolean;
  squadName: string;
}> {
  if (!elementExists(SELECTORS.SBC_SET_LIST)) {
    const backBtn = document.querySelector(SELECTORS.BACK_BUTTON) as HTMLElement | null;
    if (backBtn) {
      await humanClick(backBtn);
      await waitForLoadingComplete();
      await randomDelay(500, 1000);
    }
  }

  const squads = await getLeagueSBCSquads();
  const target = squads[index];

  if (!target) {
    return { success: false, squadName: '' };
  }

  await humanClick(target.elementRef);
  await waitForLoadingComplete();
  await randomDelay(500, 1000);

  return { success: true, squadName: target.name };
}

// ========================================================================
//  CROSS-PAGE NAVIGATION
// ========================================================================

/**
 * Navigates to the SBC section from anywhere in the app.
 */
export async function navigateToSBCHub(): Promise<void> {
  const sbcNav = await waitForElement(SELECTORS.NAV_SBC);
  await humanClick(sbcNav);
  await waitForLoadingComplete();
  await randomDelay(500, 1000);
}

/**
 * Navigates to the Transfer Market search screen.
 * Clicks the Transfers tab → then the "Search the Transfer Market" tile.
 */
export async function navigateToTransferMarket(): Promise<{ success: boolean; error?: string }> {
  // Click the Transfers tab button (always visible in the tab bar)
  const transferTab = document.querySelector(SELECTORS.NAV_TRANSFER) as HTMLElement | null;
  if (!transferTab) {
    return { success: false, error: 'Transfer tab button not found' };
  }

  await humanClick(transferTab);
  await waitForLoadingComplete();
  await randomDelay(600, 1000);

  // Click the "Search the Transfer Market" tile
  let marketTile: HTMLElement | null = null;
  for (let attempt = 0; attempt < 10 && !marketTile; attempt++) {
    marketTile = document.querySelector(SELECTORS.TRANSFER_MARKET_TILE) as HTMLElement | null;
    if (!marketTile) {
      await randomDelay(300, 500);
    }
  }

  if (!marketTile) {
    return { success: false, error: 'Transfer Market tile not found' };
  }

  await humanClick(marketTile);
  await waitForLoadingComplete();
  await randomDelay(600, 1000);

  return { success: true };
}

/**
 * Finds a button by its text content (case-insensitive).
 */
function findButtonByText(text: string): HTMLElement | null {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.trim().toLowerCase() === text) {
      return btn as HTMLElement;
    }
  }
  return null;
}
