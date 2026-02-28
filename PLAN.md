# FC26 AutoSBC — Implementation Plan

## What This Is

A Chrome extension (MV3) that fully automates EA FC 26 League SBC grinds. User clicks "Start", sets budget, and walks away. The extension reads requirements, solves squads, bulk-buys missing players, fills and submits squads, then loops.

---

## Key Corrections From Research (Override Architecture Doc)

These supersede the original architecture document where they conflict:

1. **League SBCs = 4 squads, not 18-20.** Mixed league upgrade packs have 4 squad submissions. The value is in **repeating** the same 4-squad set many times.

2. **Position doesn't matter for buying.** Chemistry requirement is only 10-16 points roughly. You only need ~3-4 in-position players for chemistry links. The rest can be any warm body from the right league. Buy the cheapest players that satisfy league/rarity constraints in bulk — don't optimize per-slot.

3. **Solver is position-first, two-pass:**
   - Pass 1: Fill slots with in-position club players (they contribute chemistry)
   - Pass 2: Fill remaining slots with any eligible player (off-position is fine)

4. **Bulk buying for repeat loops.** If user wants to repeat 3x, buy 3x the needed players in one market session (e.g., 27 commons + 6 rares). Reduces navigation round-trips.

5. **Player valuation (from SBC Monkey's approach):**
   - Untradeable duplicates: 10% of market value (use first — get rid of them)
   - Regular untradeables: 70% of market value (use second)
   - Tradeables: 100% of market value (use third)
   - Concept players: 200% of market value (buy from market — last resort)

6. **External price data + caching.** Fetch player prices from sites like FUTBIN/Futwiz rather than relying solely on live market searches. Cache these in `chrome.storage.local` with a TTL (e.g., 30 min). This gives us:
   - A baseline price before we even open the transfer market (know what to expect)
   - Smarter max BIN filters (set max price slightly above the known market rate)
   - Ability to detect if a listing is overpriced before buying
   - Fewer wasted market searches (we already know the going rate)
   - The live market search then acts as confirmation/fine-tuning, not discovery

7. **Real requirement examples (Premium Mixed Leagues Upgrade):**
   - Liga Portugal / 1A Pro League: 11 players, max 5 from same club, min 2 rare, min rating 68, min chemistry 10
   - Ligue 1 / Eredivisie: 11 players, max 3 from same club
   - Similar patterns for Bundesliga/Serie A and PL/LaLiga, chemistry 10 across the board

---

## Competitive Landscape

| Feature | AutoSBC | SBC Monkey | Solva | **FC26 AiSBC (Ours)** |
|---|---|---|---|---|
| Auto-fill from club | Yes | Yes | Yes | Yes |
| Auto-buy missing | No | No | Yes | **Yes** |
| Repeat SBC loop | No | No | Yes | **Yes — bulk buy optimized** |
| Click and forget | No | No | Partial | **Yes — full autonomous loop** |
| Smart player valuation | No | Yes | Partial | **Yes** |
| Bulk pre-purchase | No | No | No | **Yes — our differentiator** |

**Our edge:** Fully autonomous bulk-buy loop. Calculate total players needed for N repeats, buy them all in one market session, then grind all N repeats without returning to market.

---

## Architecture Overview

```
Popup (ephemeral UI) <--messages--> Background (service worker / brain)
                                         |
                                    messages
                                         |
                                    Content Script (DOM access)
                                         |
                                    EA FC Web App DOM
```

- **Background:** Orchestrator state machine, solver, budget logic, persistence
- **Content Script:** DOM reading, clicking, navigation, page detection
- **Popup:** Start/stop/pause, settings, activity log, progress display
- **Shared:** Types, constants (selectors), message definitions, utilities

### MV3 Service Worker Survival

Chrome kills service workers after ~30s idle. We handle this with:
- `chrome.alarms` every 24 seconds during active automation
- Full state persisted to `chrome.storage.local` after every transition
- Every orchestrator step is idempotent (safe to re-run if worker restarts)

---

## File Structure

```
fc26-autosbc/
├── manifest.json
├── package.json
├── tsconfig.json
├── webpack.config.js
├── src/
│   ├── background/
│   │   ├── background.ts          # Service worker entry, alarm + message listeners
│   │   ├── orchestrator.ts        # State machine (the brain)
│   │   ├── solver.ts              # Constraint solver (two-pass greedy)
│   │   ├── ratingCalc.ts          # EA squad rating formula
│   │   └── messageRouter.ts       # Routes messages to handlers
│   ├── content/
│   │   ├── content.ts             # Content script entry, command dispatcher
│   │   ├── dom/
│   │   │   ├── domReader.ts       # waitForElement, readText, waitForLoading
│   │   │   ├── domClicker.ts      # humanClick, humanType, setDropdown
│   │   │   ├── sbcPage.ts         # Parse requirements, fill slots, submit
│   │   │   ├── transferMarket.ts  # Search, parse results, buy, price check
│   │   │   └── navigation.ts      # SBC <-> Market navigation, next squad
│   │   └── observers/
│   │       └── pageObserver.ts    # MutationObserver for SPA route changes
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   ├── shared/
│   │   ├── types.ts               # All TypeScript interfaces
│   │   ├── constants.ts           # DOM selectors, timing values, enums
│   │   ├── messages.ts            # Message type definitions
│   │   └── logger.ts              # Structured logging utility
│   └── utils/
│       ├── delay.ts               # Randomized human-like delays
│       ├── retry.ts               # Retry with exponential backoff
│       ├── pricing.ts             # Player valuation logic (dupe/untradeable/tradeable scoring)
│       └── priceService.ts        # External price fetching (FUTBIN/Futwiz) + TTL cache
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tests/
│   ├── solver.test.ts
│   ├── ratingCalc.test.ts
│   └── orchestrator.test.ts
└── dist/                          # Build output (gitignored)
```

---

## Build Phases

### Phase 0 — Project Skeleton
**Goal:** Buildable extension that loads in Chrome and shows popup.

- [ ] Configure `tsconfig.json` for the project (ES2020, DOM lib, rootDir/outDir)
- [ ] Create `webpack.config.js` with 3 entry points (background, content, popup)
- [ ] Update `package.json` scripts (build, watch, test)
- [ ] Create `manifest.json` (MV3, permissions, content script matching)
- [ ] Create placeholder `src/` files for all 3 entry points
- [ ] Create `popup.html` + `popup.css` with basic layout
- [ ] Create placeholder icons in `assets/`
- [ ] Create `src/shared/types.ts` with all core interfaces
- [ ] Create `src/shared/constants.ts` with selector registry
- [ ] Create `src/shared/messages.ts` with message type definitions
- [ ] Verify `npm run build` produces a loadable `dist/` folder
- [ ] Load in Chrome and confirm popup opens

### Phase 1 — DOM Foundation
**Goal:** Content script can read pages and click elements.

- [ ] `src/utils/delay.ts` — randomized delays with normal distribution
- [ ] `src/content/dom/domReader.ts` — waitForElement, waitForLoading, readText
- [ ] `src/content/dom/domClicker.ts` — humanClick, humanType, setDropdownFilter
- [ ] `src/content/observers/pageObserver.ts` — SPA page detection
- [ ] `src/content/content.ts` — message listener, command dispatcher
- [ ] Manual test: inject into EA web app, confirm page detection works

### Phase 2 — SBC Requirement Parser
**Goal:** Read and structure SBC requirements from the DOM.

- [ ] `src/content/dom/sbcPage.ts` — parseRequirements()
- [ ] Handle all constraint types: rating, chemistry, league, nation, club, quality, diversity (max from same)
- [ ] Validation: throw if 0 constraints parsed (selector breakage detection)
- [ ] Wire up `READ_SBC_REQUIREMENTS` message handler in content script
- [ ] Test with real SBC page

### Phase 3 — Solver Engine
**Goal:** Given requirements + available players, output a valid squad.

- [ ] `src/background/ratingCalc.ts` — EA's rating formula + `requiredRatingForRemaining`
- [ ] `src/background/solver.ts` — two-pass greedy solver
  - Pass 1: Fill in-position club players (for chemistry)
  - Pass 2: Fill remaining with any eligible player
  - Player valuation: prefer untradeable dupes > untradeables > tradeables
  - Generate `MarketSearchCriteria[]` for empty slots (league + rarity, NOT position-specific)
- [ ] Unit tests for solver with various requirement combos
- [ ] Unit tests for rating calculator

### Phase 4 — Transfer Market Buyer
**Goal:** Search market, parse results, buy players.

- [ ] `src/content/dom/transferMarket.ts`:
  - `navigateToTransferMarket()`
  - `searchTransferMarket(criteria)` — set filters, search, parse results
  - `buyPlayer(listing)` — click, BIN, confirm, detect outcome
  - `searchAndBuyPlayer(criteria, retries)` — full pipeline with retry on snipe
  - `checkMarketPrice(criteria)` — price check without buying
- [ ] `src/utils/pricing.ts` — player valuation scoring (dupe 10%, untradeable 70%, tradeable 100%, buy 200%)
- [ ] `src/utils/priceService.ts` — external price fetching + cache:
  - Fetch prices from FUTBIN/Futwiz API or page scrape
  - Cache to `chrome.storage.local` with 30-min TTL
  - Lookup by league + rating + rarity → expected market price
  - Use cached price to set smart max BIN filters (e.g., cached price + 10% buffer)
  - Fallback: if external fetch fails, use live market search as discovery
- [ ] `src/utils/retry.ts` — exponential backoff wrapper
- [ ] Handle errors: sniped, insufficient coins, expired, no results
- [ ] Bulk buy mode: buy N players matching criteria in one session

### Phase 5 — Squad Filler + Submitter
**Goal:** Place players into SBC slots and submit.

- [ ] `src/content/dom/sbcPage.ts` additions:
  - `fillSquad(assignments)` — click slot, search player in picker, place
  - `submitSquad()` — verify all filled, verify requirements met, submit + confirm
  - Auto-dismiss reward screen
- [ ] Handle edge cases: player not found in picker, submit button disabled

### Phase 6 — Orchestrator State Machine
**Goal:** Full autonomous loop.

- [ ] `src/background/orchestrator.ts`:
  - State definitions (idle → reading_requirements → solving → buying → filling → submitting → advancing → loop)
  - State persistence to `chrome.storage.local` after every transition
  - Keepalive alarm (every 24s)
  - Budget enforcement at 3 levels (pre-squad estimate, pre-purchase check, post-purchase balance)
  - Pause/resume/stop
  - Error counting with auto-pause after N consecutive failures
- [ ] `src/background/messageRouter.ts` — handle all message types
- [ ] `src/background/background.ts` — service worker entry, register listeners

### Phase 7 — League SBC Navigation
**Goal:** Move between squads in a set, detect completion.

- [ ] `src/content/dom/navigation.ts`:
  - `getLeagueSBCSquads()` — list all challenges, which are complete
  - `navigateToNextIncomplete()` — find and click next
  - `returnToSBCChallenge()` — navigate back from market/club
- [ ] Report total/remaining counts to orchestrator

### Phase 8 — Popup UI
**Goal:** Polished control panel.

- [ ] Status display (idle/running/paused/error/complete with colored dot)
- [ ] Budget inputs (per-player max, total budget)
- [ ] Repeat count input (how many times to grind the set)
- [ ] Speed slider (slow/normal/fast)
- [ ] Start/Pause/Stop buttons
- [ ] Activity log (newest on top, capped at 50 entries)
- [ ] Progress display (X/Y squads, coins spent, repeat X of N)
- [ ] All state queried from background on popup open (ephemeral UI pattern)

### Phase 9 — Bulk Buy Optimization
**Goal:** The differentiator. Pre-calculate and bulk purchase for N repeats.

- [ ] Before starting repeats, calculate total players needed:
  - Per squad: how many from club, how many to buy (by league + rarity)
  - Multiply by repeat count
  - Subtract already-owned eligible players
- [ ] Single market session: buy all needed players
- [ ] Track purchased inventory as squads consume players
- [ ] Handle partial success (bought 20 of 27 needed — adjust repeat count)

### Phase 10 — Polish & Safety
**Goal:** Robust, safe, human-like.

- [ ] Human-like timing: occasional long pauses, session breaks after 20-30 min
- [ ] Coin reserve enforcement (never drop below reserve amount)
- [ ] Structured logging throughout
- [ ] Error recovery: if stuck on unknown page, navigate back to SBC hub
- [ ] Selector validation on startup (warn if EA has changed DOM structure)
- [ ] Edge case: handle "SBC expired" mid-grind
- [ ] Edge case: handle network errors / page reload

---

## Core Data Types (Quick Reference)

```typescript
// Player from club
interface ClubPlayer {
  id: string; name: string; rating: number;
  position: string; league: string; nation: string; club: string;
  quality: 'gold' | 'silver' | 'bronze';
  isRare: boolean; isUntradeable: boolean; isDuplicate: boolean;
}

// What to search for on market
interface MarketSearchCriteria {
  league: string;           // Required for league SBCs
  quality?: string;         // 'rare' if needed
  minRating?: number;       // If squad rating is tight
  maxPrice: number;         // Per-player budget cap
  quantity: number;         // How many to buy (for bulk)
}

// SBC requirements (parsed from DOM)
interface SBCRequirements {
  challengeName: string;
  squadSize: number;        // Usually 11
  minRating: number | null;
  minChemistry: number | null;
  leagueRequirements: { leagueName: string; minCount: number }[];
  nationRequirements: { nationName: string; minCount: number }[];
  qualityRequirements: { quality: string; minCount: number }[];
  clubRequirements: { clubName: string; minCount: number }[];
  diversityConstraints: { type: string; maxFromSame: number }[];
}

// Orchestrator state
interface OrchestratorState {
  status: OrchestratorStatus;
  currentSquadIndex: number;
  totalSquads: number;
  completedSquads: number;
  currentRepeat: number;
  totalRepeats: number;
  totalCoinsSpent: number;
  purchasedInventory: Map<string, number>; // league+rarity -> count remaining
  config: UserConfig;
  // ... plus requirements, solver result, buy queue, logs, errors
}
```

---

## Solver Strategy (Detailed)

For a typical league SBC squad (e.g., "11 Liga Portugal, max 5 from same club, min 2 rare, min 68 rating, min 10 chemistry"):

1. **From club — in-position players first** (for chemistry contribution):
   - Find Liga Portugal players already owned, matching slot positions
   - Prefer: untradeable duplicates > untradeables > lowest-rated tradeables
   - Place them in matching formation slots

2. **From club — off-position players**:
   - Fill remaining slots with any Liga Portugal players owned
   - Position doesn't matter much since chemistry 10 is low

3. **Check constraints**:
   - Rarity met? (need min 2 rare)
   - Club diversity met? (max 5 from same club)
   - Rating feasible? (check if remaining slots can hit target)
   - Chemistry feasible? (typically yes with 3-4 in-position)

4. **Generate buy list** for unfilled slots:
   - Just need: Liga Portugal commons/rares at cheapest price
   - If rarity constraint unmet, specify "rare" in search
   - If rating is tight, specify minRating in search
   - **Don't specify position** — buy the cheapest eligible player

5. **For bulk repeats**: multiply the buy list by repeat count, subtract owned inventory.

---

## What To Build First

Start with Phase 0 (skeleton) and Phase 1 (DOM foundation) — these are prerequisites for everything. Then Phase 3 (solver) can be built and unit-tested in parallel with Phase 2 (parser) since the solver only depends on the shared types, not on the DOM.

The critical path is: Phase 0 → Phase 1 → Phase 2 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8.
Phase 3 (solver) and Phase 9 (bulk buy) can be developed alongside once types are defined.
