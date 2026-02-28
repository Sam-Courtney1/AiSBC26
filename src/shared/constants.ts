// Centralized DOM selector registry.
// Priority: data-* attributes > semantic structure > text content > class names.
// When EA updates their DOM, only this file needs changing.

export const SELECTORS = {
  // --- SBC Page ---
  SBC_SET_LIST: '.ut-set-list-view',
  SBC_CHALLENGE_ROW: '.ut-sbc-challenge-table-row-view',
  SBC_CHALLENGE_ROW_TITLE: '.ut-sbc-challenge-table-row-view--title',
  SBC_CHALLENGE_TITLE_INSIDE: 'h1.title',
  SBC_PROGRESS_LABEL: '.ut-progress-bar--label',
  SBC_CHALLENGE_ITEM: '.ut-set-tile-view',
  SBC_CHALLENGE_NAME: '.ut-set-tile-view .tile-title',
  SBC_CHALLENGE_STATUS: '.ut-set-tile-view .tile-status',
  SBC_SQUAD_SLOT: '.ut-squad-slot-view',
  SBC_SQUAD_SLOT_EMPTY: '.ut-squad-slot-view.empty',

  // --- AutoSBC Integration ---
  // AutoSBC extension provides squad solving + filling. We just click its buttons.
  AUTOSBC_BUTTON: '#auto-sbc-button',           // Opens AutoSBC panel inside an SBC
  AUTOSBC_LAUNCH: '#auto-sbc-launch',            // Triggers auto-build in AutoSBC
  AUTOSBC_DIALOG: '#auto-sbc',                    // AutoSBC container div (disappears when build is done)

  // --- Submit Button ---
  // Full class: "ut-squad-tab-button-control actionTab right primary"
  // When disabled: adds "disabled" class
  SBC_SUBMIT_BUTTON: '.ut-squad-tab-button-control.actionTab.right.primary',
  SBC_SUBMIT_DISABLED: '.ut-squad-tab-button-control.actionTab.right.primary.disabled',

  // --- Confirm Dialog ---
  CONFIRM_BUTTON: '.btn-standard.primary',
  DIALOG_OK_BUTTON: '.btn-standard.primary',

  // --- Navigation ---
  NAV_SBC: '.ut-tile-view-renderer [data-nav="sbc"]',
  NAV_TRANSFER: '.ut-tab-bar-item.icon-transfer',
  NAV_HOME: '.ut-tab-bar-item.icon-home',
  NAV_SBC_TAB: '.ut-tab-bar-item.icon-sbc',
  TRANSFER_MARKET_TILE: '.ut-tile-transfer-market',
  BACK_BUTTON: '.ut-navigation-button-control',

  // --- Home / Unassigned Items ---
  UNASSIGNED_TILE: '.ut-unassigned-tile-view',
  SEND_ALL_TO_CLUB: 'button.autosbc-header-button',
  ORGANIZE_UNASSIGNED: 'button.btn-standard.primary.mini',

  // --- General ---
  LOADING_SPINNER: '.ut-loading-spinner',
  DIALOG_OVERLAY: '.ut-dialog-view',
  DIALOG_BODY: '.ut-dialog-view .dialog-body',
  COIN_BALANCE: '.ut-coin-balance-view .value',

  // --- Reward Screen ---
  REWARD_SCREEN: '.ut-store-reveal-view',
  REWARD_DISMISS: '.ut-store-reveal-view .call-to-action',

  // --- Paletools Filter (Transfer Market) ---
  PALETOOLS_FILTER_DROPDOWN: '.inline-container',
  PALETOOLS_FILTER_LABEL: '.inline-container span.label',
  PALETOOLS_FILTER_LIST: 'ul.inline-list',
  PALETOOLS_FILTER_ITEM: 'ul.inline-list li',

  // --- Transfer Market Price ---
  // All price filter blocks on the search page (Bid Min, Bid Max, BIN Min, BIN Max)
  PRICE_FILTER_BLOCK: '.price-filter',
  PRICE_FILTER_LABEL: '.price-filter .info .label',
  PRICE_INCREMENT_BUTTON: '.increment-value',
  PRICE_INPUT: '.ut-number-input-control',

  // --- Transfer Market Reset ---
  // Reset button clears all filters including price (must click before loading a new filter)
  MARKET_RESET_BUTTON: 'button.btn-standard',

  // --- Coin Balance (navbar) ---
  COIN_NAVBAR: '.view-navbar-currency-coins',
} as const;

// Timing presets per speed mode (milliseconds)
export const TIMING = {
  slow: {
    actionMin: 2000,
    actionMax: 4000,
    betweenMin: 3000,
    betweenMax: 6000,
    navigationMin: 2000,
    navigationMax: 4000,
  },
  normal: {
    actionMin: 800,
    actionMax: 1500,
    betweenMin: 1500,
    betweenMax: 3000,
    navigationMin: 1000,
    navigationMax: 2000,
  },
  fast: {
    actionMin: 400,
    actionMax: 800,
    betweenMin: 700,
    betweenMax: 1500,
    navigationMin: 500,
    navigationMax: 1000,
  },
} as const;

// Price cache TTL (30 minutes)
export const PRICE_CACHE_TTL_MS = 30 * 60 * 1000;

// Player valuation multipliers
export const VALUATION = {
  UNTRADEABLE_DUPLICATE: 0.10,
  UNTRADEABLE: 0.70,
  TRADEABLE: 1.00,
  CONCEPT_BUY: 2.00,
} as const;

// League SBC challenge title → primary league mapping (hardcoded)
// The challenge titles contain two leagues separated by "&", we track the first one.
export const LEAGUE_MAP: Record<string, string> = {
  'liga portugal': 'Liga Portugal',
  'ligue 1': 'Ligue 1',
  'bundesliga': 'Bundesliga',
  'premier league': 'Premier League',
};

// Players needed per league for one SBC repeat (common + rare)
// Premier League excluded — rarely needs buying
export const LEAGUE_BUY_COUNTS: Record<string, { common: number; rare: number }> = {
  'Liga Portugal': { common: 11, rare: 2 },
  'Ligue 1': { common: 10, rare: 3 },
  'Bundesliga': { common: 9, rare: 3 },
};

// Paletools filter names per league (must match exactly what appears in the dropdown)
export const PALETOOLS_FILTERS: Record<string, { common: string; rare: string }> = {
  'Liga Portugal': { common: 'Liga Portugal common gold', rare: 'Liga Portugal Rare' },
  'Ligue 1': { common: 'Ligue 1 common gold', rare: 'Ligue 1 Rare' },
  'Bundesliga': { common: 'Bundesliga common gold', rare: 'Bundesliga Rare' },
};

// Buy macro timing (milliseconds)
export const BUY_MACRO = {
  SEARCH_TO_BUY_DELAY: 200,     // delay between press "3" and "ArrowDown"
  CYCLE_INTERVAL: 1700,          // total time per buy cycle (~1.7s)
  PRICE_INCREMENT_COMMON: 4,    // 4 clicks × 50 coins = 300 coin max buy price (common gold)
  PRICE_INCREMENT_RARE: 5,      // 5 clicks × 50 coins = 350 coin max buy price (rare)
  PRICE_PER_PLAYER: 350,        // expected cost per player for coin verification
} as const;
