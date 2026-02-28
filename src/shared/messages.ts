import type {
  SBCRequirements,
  ClubPlayer,
  MarketSearchCriteria,
  SlotAssignment,
  PurchaseResult,
  UserConfig,
  OrchestratorStatus,
  LogEntry,
  PageType,
} from './types';

// ---- Messages FROM Popup TO Background ----

export interface StartGrindMessage {
  type: 'START_GRIND';
  config: Partial<UserConfig>;
}

export interface PauseGrindMessage {
  type: 'PAUSE_GRIND';
}

export interface ResumeGrindMessage {
  type: 'RESUME_GRIND';
}

export interface StopGrindMessage {
  type: 'STOP_GRIND';
}

export interface GetStatusMessage {
  type: 'GET_STATUS';
}

export interface UpdateConfigMessage {
  type: 'UPDATE_CONFIG';
  config: Partial<UserConfig>;
}

// ---- Messages FROM Background TO Content Script ----

export interface ReadSBCRequirementsMessage {
  type: 'READ_SBC_REQUIREMENTS';
}

export interface ScanClubMessage {
  type: 'SCAN_CLUB';
  payload: { requirements: SBCRequirements };
}

export interface NavigateToMarketMessage {
  type: 'NAVIGATE_TO_MARKET';
}

export interface SearchAndBuyMessage {
  type: 'SEARCH_AND_BUY';
  payload: MarketSearchCriteria;
}

export interface NavigateToSBCMessage {
  type: 'NAVIGATE_TO_SBC';
}

export interface FillSquadMessage {
  type: 'FILL_SQUAD';
  payload: { assignments: SlotAssignment[] };
}

export interface SubmitSquadMessage {
  type: 'SUBMIT_SQUAD';
}

export interface NavigateNextSquadMessage {
  type: 'NAVIGATE_NEXT_SQUAD';
  payload: { index: number };
}

export interface GetCoinBalanceMessage {
  type: 'GET_COIN_BALANCE';
}

// ---- Messages FROM Content Script TO Background ----

export interface RequirementsDataMessage {
  type: 'REQUIREMENTS_DATA';
  success: boolean;
  payload: SBCRequirements;
}

export interface ClubPlayersDataMessage {
  type: 'CLUB_PLAYERS_DATA';
  success: boolean;
  payload: { players: ClubPlayer[] };
}

export interface PurchaseResultMessage {
  type: 'PURCHASE_RESULT';
  success: boolean;
  payload: PurchaseResult;
}

export interface SquadFilledMessage {
  type: 'SQUAD_FILLED';
  success: boolean;
  payload: { filledCount: number; errors: string[] };
}

export interface SquadSubmittedMessage {
  type: 'SQUAD_SUBMITTED';
  success: boolean;
  payload: { error?: string };
}

export interface PageChangedMessage {
  type: 'PAGE_CHANGED';
  payload: { page: PageType };
}

export interface CoinBalanceMessage {
  type: 'COIN_BALANCE';
  payload: number;
}

// ---- Messages FROM Background TO Popup ----

export interface StatusUpdateMessage {
  type: 'STATUS_UPDATE';
  payload: {
    status: OrchestratorStatus;
    completedSquads: number;
    totalSquads: number;
    totalCoinsSpent: number;
    currentRepeat: number;
    totalRepeats: number;
    error?: string;
  };
}

export interface LogEntryMessage {
  type: 'LOG_ENTRY';
  payload: LogEntry;
}

// ---- Union Types ----

export type PopupToBackgroundMessage =
  | StartGrindMessage
  | PauseGrindMessage
  | ResumeGrindMessage
  | StopGrindMessage
  | GetStatusMessage
  | UpdateConfigMessage;

export type BackgroundToContentMessage =
  | ReadSBCRequirementsMessage
  | ScanClubMessage
  | NavigateToMarketMessage
  | SearchAndBuyMessage
  | NavigateToSBCMessage
  | FillSquadMessage
  | SubmitSquadMessage
  | NavigateNextSquadMessage
  | GetCoinBalanceMessage;

export type ContentToBackgroundMessage =
  | RequirementsDataMessage
  | ClubPlayersDataMessage
  | PurchaseResultMessage
  | SquadFilledMessage
  | SquadSubmittedMessage
  | PageChangedMessage
  | CoinBalanceMessage;

export type BackgroundToPopupMessage =
  | StatusUpdateMessage
  | LogEntryMessage;

export type AnyMessage =
  | PopupToBackgroundMessage
  | BackgroundToContentMessage
  | ContentToBackgroundMessage
  | BackgroundToPopupMessage;
