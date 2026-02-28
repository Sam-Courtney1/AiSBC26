// ---- Player Types ----

export type PlayerQuality = 'gold' | 'silver' | 'bronze';

export interface ClubPlayer {
  id: string;
  name: string;
  rating: number;
  position: string;
  altPositions: string[];
  league: string;
  nation: string;
  club: string;
  quality: PlayerQuality;
  isRare: boolean;
  isUntradeable: boolean;
  isDuplicate: boolean;
}

// ---- SBC Requirements ----

export interface LeagueRequirement {
  leagueName: string;
  minCount: number;
}

export interface NationRequirement {
  nationName: string;
  minCount: number;
}

export interface QualityRequirement {
  quality: string;
  minCount: number;
}

export interface ClubRequirement {
  clubName: string;
  minCount: number;
}

export interface DiversityConstraint {
  type: 'league' | 'nation' | 'club';
  maxFromSame: number;
}

export interface SBCRequirements {
  challengeName: string;
  squadSize: number;
  minRating: number | null;
  minChemistry: number | null;
  leagueRequirements: LeagueRequirement[];
  nationRequirements: NationRequirement[];
  qualityRequirements: QualityRequirement[];
  clubRequirements: ClubRequirement[];
  diversityConstraints: DiversityConstraint[];
}

// ---- Market Types ----

export interface MarketSearchCriteria {
  league: string;
  quality?: string;
  minRating?: number;
  maxPrice: number;
  quantity: number;
}

export interface MarketListing {
  playerName: string;
  rating: number;
  position: string;
  buyNowPrice: number;
  currentBid: number;
  timeRemaining: string;
  elementRef: HTMLElement;
}

export interface PurchaseResult {
  success: boolean;
  playerName: string;
  pricePaid: number;
  error?: string;
}

// ---- Solver Types ----

export interface SlotAssignment {
  slotIndex: number;
  player: ClubPlayer;
}

export interface SolverResult {
  success: boolean;
  squad: (ClubPlayer | null)[];
  fromClub: ClubPlayer[];
  toBuy: MarketSearchCriteria[];
  estimatedCost: number;
  projectedRating: number;
  projectedChemistry: number;
}

// ---- Formation Types ----

export interface Formation {
  name: string;
  positions: string[];
  links: number[][];  // adjacency list: links[i] = indices of neighbors of position i
}

// ---- Orchestrator Types ----

export type OrchestratorStatus =
  | 'idle'
  | 'reading_requirements'
  | 'scanning_club'
  | 'solving'
  | 'navigating_to_market'
  | 'buying_player'
  | 'navigating_to_sbc'
  | 'filling_squad'
  | 'submitting'
  | 'advancing_to_next'
  | 'complete'
  | 'paused'
  | 'error';

export type SpeedMode = 'slow' | 'normal' | 'fast';

export interface UserConfig {
  maxPricePerPlayer: number;
  totalBudget: number;
  reserveCoins: number;
  speedMode: SpeedMode;
  repeatCount: number;
  preferUntradeable: boolean;
  skipExpensiveSquads: boolean;
  autoCollectRewards: boolean;
  maxConsecutiveErrors: number;
  pauseOnLowCoins: boolean;
}

export const DEFAULT_CONFIG: UserConfig = {
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

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface OrchestratorState {
  status: OrchestratorStatus;
  currentLeagueSBC: string | null;
  currentSquadIndex: number;
  totalSquads: number;
  completedSquads: number;
  currentRepeat: number;
  totalRepeats: number;
  currentRequirements: SBCRequirements | null;
  solverResult: SolverResult | null;
  buyQueue: MarketSearchCriteria[];
  buyQueueIndex: number;
  totalCoinsSpent: number;
  config: UserConfig;
  logs: LogEntry[];
  lastError: string | null;
  pausedAt: OrchestratorStatus | null;
}

// ---- Navigation Types ----

export type PageType =
  | 'sbc_hub'
  | 'sbc_set'
  | 'sbc_challenge'
  | 'sbc_squad'
  | 'transfer_search'
  | 'transfer_results'
  | 'club'
  | 'unknown';

export interface LeagueSBCSquad {
  name: string;
  primaryLeague: string;
  isComplete: boolean;
  elementRef: HTMLElement;
}

// ---- Price Cache ----

export interface CachedPrice {
  league: string;
  quality: string;
  avgPrice: number;
  minPrice: number;
  fetchedAt: number;  // timestamp
}
