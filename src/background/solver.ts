import type {
  SBCRequirements,
  ClubPlayer,
  MarketSearchCriteria,
  SolverResult,
  Formation,
} from '../shared/types';
import { calculateSquadRating, requiredRatingForRemaining } from './ratingCalc';
import { sortByUseCost } from '../utils/pricing';

// ========================================================================
//  DEFAULT FORMATION
// ========================================================================

/**
 * 4-4-2 formation — the most commonly used for league SBCs.
 * positions[i] is the required position for slot i.
 * links[i] lists which other slot indices are adjacent to slot i
 * (used for chemistry estimation).
 */
export const FORMATION_442: Formation = {
  name: '4-4-2',
  positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
  links: [
    [1, 2, 3, 4],     // GK links to back 4
    [0, 2, 5],         // LB
    [0, 1, 3, 6],      // CB left
    [0, 2, 4, 7],      // CB right
    [0, 3, 8],         // RB
    [1, 6, 9],         // LM
    [2, 5, 7, 9],      // CM left
    [3, 6, 8, 10],     // CM right
    [4, 7, 10],        // RM
    [5, 6, 10],        // ST left
    [7, 8, 9],         // ST right
  ],
};

// ========================================================================
//  POSITION COMPATIBILITY
// ========================================================================

/**
 * Map of which positions can play in which slots.
 * A player at their natural position gets full chemistry.
 * Adjacent positions can fill a slot but won't contribute chemistry links.
 */
const POSITION_COMPAT: Record<string, string[]> = {
  GK:  [],
  LB:  ['LWB'],
  CB:  [],
  RB:  ['RWB'],
  LM:  ['LW'],
  CM:  ['CAM', 'CDM'],
  RM:  ['RW'],
  LW:  ['LM', 'LF'],
  RW:  ['RM', 'RF'],
  CAM: ['CF', 'CM'],
  CDM: ['CM'],
  CF:  ['ST', 'CAM'],
  ST:  ['CF', 'LF', 'RF'],
  LWB: ['LB'],
  RWB: ['RB'],
  LF:  ['LW', 'ST'],
  RF:  ['RW', 'ST'],
};

/** Returns true if a player's position can fill the given slot position. */
function positionMatches(playerPos: string, slotPos: string): boolean {
  if (playerPos === slotPos) return true;
  return POSITION_COMPAT[slotPos]?.includes(playerPos) ?? false;
}

/** Returns true if the player is in their exact natural position for the slot. */
function isExactPosition(playerPos: string, slotPos: string): boolean {
  return playerPos === slotPos;
}

// ========================================================================
//  CONSTRAINT CHECKING
// ========================================================================

interface ConstraintCheck {
  met: boolean;
  shortfall: number; // How many more players needed (0 if met)
}

/** Checks if all league requirements are satisfied by the current squad. */
function checkLeagueConstraints(
  squad: (ClubPlayer | null)[],
  req: SBCRequirements
): ConstraintCheck {
  let totalShortfall = 0;
  for (const lr of req.leagueRequirements) {
    const count = squad.filter(p => p && p.league === lr.leagueName).length;
    if (count < lr.minCount) totalShortfall += lr.minCount - count;
  }
  return { met: totalShortfall === 0, shortfall: totalShortfall };
}

/** Checks if all nation requirements are satisfied. */
function checkNationConstraints(
  squad: (ClubPlayer | null)[],
  req: SBCRequirements
): ConstraintCheck {
  let totalShortfall = 0;
  for (const nr of req.nationRequirements) {
    const count = squad.filter(p => p && p.nation === nr.nationName).length;
    if (count < nr.minCount) totalShortfall += nr.minCount - count;
  }
  return { met: totalShortfall === 0, shortfall: totalShortfall };
}

/** Checks if all quality (rare/common/gold/silver/bronze) requirements are satisfied. */
function checkQualityConstraints(
  squad: (ClubPlayer | null)[],
  req: SBCRequirements
): ConstraintCheck {
  let totalShortfall = 0;
  for (const qr of req.qualityRequirements) {
    const count = squad.filter(p => {
      if (!p) return false;
      if (qr.quality === 'rare') return p.isRare;
      if (qr.quality === 'common') return !p.isRare;
      return p.quality === qr.quality;
    }).length;
    if (count < qr.minCount) totalShortfall += qr.minCount - count;
  }
  return { met: totalShortfall === 0, shortfall: totalShortfall };
}

/** Checks if all club requirements are satisfied. */
function checkClubConstraints(
  squad: (ClubPlayer | null)[],
  req: SBCRequirements
): ConstraintCheck {
  let totalShortfall = 0;
  for (const cr of req.clubRequirements) {
    const count = squad.filter(p => p && p.club === cr.clubName).length;
    if (count < cr.minCount) totalShortfall += cr.minCount - count;
  }
  return { met: totalShortfall === 0, shortfall: totalShortfall };
}

/** Checks diversity constraints (e.g., max 5 from same club). */
function checkDiversityConstraints(
  squad: (ClubPlayer | null)[],
  req: SBCRequirements
): boolean {
  for (const dc of req.diversityConstraints) {
    const groups = new Map<string, number>();
    for (const p of squad) {
      if (!p) continue;
      const key = dc.type === 'club' ? p.club :
                  dc.type === 'nation' ? p.nation : p.league;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    for (const count of groups.values()) {
      if (count > dc.maxFromSame) return false;
    }
  }
  return true;
}

/**
 * Would adding this player to the squad violate any diversity constraint?
 * Used during filling to avoid placing a player that would break max-from-same rules.
 */
function wouldViolateDiversity(
  player: ClubPlayer,
  squad: (ClubPlayer | null)[],
  req: SBCRequirements
): boolean {
  for (const dc of req.diversityConstraints) {
    const key = dc.type === 'club' ? player.club :
                dc.type === 'nation' ? player.nation : player.league;
    const currentCount = squad.filter(p => {
      if (!p) return false;
      const pKey = dc.type === 'club' ? p.club :
                   dc.type === 'nation' ? p.nation : p.league;
      return pKey === key;
    }).length;
    if (currentCount >= dc.maxFromSame) return true;
  }
  return false;
}

// ========================================================================
//  CHEMISTRY ESTIMATION
// ========================================================================

/**
 * Estimates total squad chemistry.
 * Each player can earn 0-3 chemistry points based on links to neighbors:
 * - Same club: +1
 * - Same league: +1
 * - Same nation: +1
 * Capped at 3 per player. Total max = 33.
 *
 * Only players in their exact natural position contribute chemistry.
 */
export function estimateChemistry(
  squad: (ClubPlayer | null)[],
  formation: Formation
): number {
  let totalChem = 0;

  for (let i = 0; i < squad.length; i++) {
    const p = squad[i];
    if (!p) continue;

    // Off-position players don't contribute chemistry
    if (!isExactPosition(p.position, formation.positions[i]!)) continue;

    let playerChem = 0;
    const neighbors = formation.links[i];
    if (!neighbors) continue;

    for (const neighborIdx of neighbors) {
      const neighbor = squad[neighborIdx];
      if (!neighbor) continue;

      if (p.club === neighbor.club) playerChem++;
      else if (p.league === neighbor.league) playerChem++;
      if (p.nation === neighbor.nation) playerChem++;
    }

    totalChem += Math.min(playerChem, 3);
  }

  return totalChem;
}

// ========================================================================
//  SOLVER — TWO-PASS GREEDY
// ========================================================================

/**
 * Main solver entry point.
 *
 * Two-pass approach (per PLAN.md):
 *   Pass 1: Fill slots with in-position club players (they contribute chemistry)
 *   Pass 2: Fill remaining slots with any eligible player (off-position is fine
 *           since chemistry requirement is only ~10)
 *
 * Player priority (via sortByUseCost):
 *   Untradeable duplicates > untradeables > lowest-rated tradeables
 *
 * After filling from club, generates MarketSearchCriteria for any empty slots.
 * Criteria are by league + rarity (NOT position-specific) since position
 * doesn't matter for cheap league SBC fodder.
 */
export function solveSquad(
  requirements: SBCRequirements,
  clubPlayers: ClubPlayer[],
  formation: Formation = FORMATION_442,
  maxPricePerPlayer: number = 1500
): SolverResult {
  const squadSize = Math.min(requirements.squadSize, formation.positions.length);
  const squad: (ClubPlayer | null)[] = new Array(squadSize).fill(null);
  const usedIds = new Set<string>();

  // Sort players by use cost — cheapest to sacrifice first
  const sorted = sortByUseCost(clubPlayers);

  // ------------------------------------------------------------------
  // PASS 1: Fill with in-position players (contribute chemistry)
  // ------------------------------------------------------------------
  for (let i = 0; i < squadSize; i++) {
    const slotPos = formation.positions[i]!;
    const candidate = sorted.find(
      p => !usedIds.has(p.id) &&
           isExactPosition(p.position, slotPos) &&
           meetsSlotConstraints(p, squad, requirements) &&
           !wouldViolateDiversity(p, squad, requirements)
    );
    if (candidate) {
      squad[i] = candidate;
      usedIds.add(candidate.id);
    }
  }

  // ------------------------------------------------------------------
  // PASS 2: Fill remaining with any eligible player (off-position OK)
  // ------------------------------------------------------------------
  for (let i = 0; i < squadSize; i++) {
    if (squad[i]) continue;

    const slotPos = formation.positions[i]!;
    const candidate = sorted.find(
      p => !usedIds.has(p.id) &&
           positionMatches(p.position, slotPos) &&
           meetsSlotConstraints(p, squad, requirements) &&
           !wouldViolateDiversity(p, squad, requirements)
    );
    if (candidate) {
      squad[i] = candidate;
      usedIds.add(candidate.id);
    }
  }

  // ------------------------------------------------------------------
  // PASS 3: Last resort — fill with ANY eligible player regardless of position.
  // For league SBCs the webapp usually lets you place anyone.
  // ------------------------------------------------------------------
  for (let i = 0; i < squadSize; i++) {
    if (squad[i]) continue;

    const candidate = sorted.find(
      p => !usedIds.has(p.id) &&
           meetsSlotConstraints(p, squad, requirements) &&
           !wouldViolateDiversity(p, squad, requirements)
    );
    if (candidate) {
      squad[i] = candidate;
      usedIds.add(candidate.id);
    }
  }

  // ------------------------------------------------------------------
  // Generate buy list for empty slots
  // ------------------------------------------------------------------
  const emptySlots = squad.filter(p => p === null).length;
  const toBuy = generateBuyList(squad, requirements, maxPricePerPlayer);

  // ------------------------------------------------------------------
  // Calculate projections
  // ------------------------------------------------------------------
  const filledRatings = squad.filter(Boolean).map(p => p!.rating);
  const projectedRating = filledRatings.length === squadSize
    ? calculateSquadRating(filledRatings)
    : 0;
  const projectedChemistry = estimateChemistry(squad, formation);

  return {
    success: emptySlots === 0 || toBuy.length > 0,
    squad,
    fromClub: squad.filter(Boolean) as ClubPlayer[],
    toBuy,
    estimatedCost: toBuy.reduce((sum, c) => sum + c.maxPrice * c.quantity, 0),
    projectedRating,
    projectedChemistry,
  };
}

/**
 * Checks if a player helps meet the SBC's specific constraints
 * (league, nation, quality, club). Returns true if the player
 * contributes to at least one unmet constraint, OR if there are
 * no unfilled constraints (any player is fine).
 */
function meetsSlotConstraints(
  player: ClubPlayer,
  currentSquad: (ClubPlayer | null)[],
  req: SBCRequirements
): boolean {
  // If there are league requirements, player must match at least one
  // that isn't yet fully satisfied
  if (req.leagueRequirements.length > 0) {
    const matchesNeededLeague = req.leagueRequirements.some(lr => {
      if (player.league !== lr.leagueName) return false;
      const currentCount = currentSquad.filter(p => p && p.league === lr.leagueName).length;
      return currentCount < lr.minCount;
    });
    // Also allow if ALL league requirements are already met
    const allLeaguesMet = req.leagueRequirements.every(lr => {
      const count = currentSquad.filter(p => p && p.league === lr.leagueName).length;
      return count >= lr.minCount;
    });
    if (!matchesNeededLeague && !allLeaguesMet) return false;
  }

  return true;
}

// ========================================================================
//  BUY LIST GENERATION
// ========================================================================

/**
 * Generates market search criteria for unfilled squad slots.
 *
 * Key insight from PLAN.md: we DON'T search by position.
 * Chemistry requirement is low (~10), so we just need cheap bodies
 * from the right league with the right rarity. Buy the cheapest available.
 */
function generateBuyList(
  squad: (ClubPlayer | null)[],
  requirements: SBCRequirements,
  maxPrice: number
): MarketSearchCriteria[] {
  const emptyCount = squad.filter(p => p === null).length;
  if (emptyCount === 0) return [];

  const criteria: MarketSearchCriteria[] = [];

  // Determine which constraints still need players
  const needsRare = getUnmetQualityCount(squad, requirements, 'rare');
  const needsLeague = getUnmetLeagueNeeds(squad, requirements);

  // First: buy players that satisfy the most constraints simultaneously
  // (e.g., rare + correct league)
  if (needsRare > 0 && needsLeague.length > 0) {
    const rareLeague = needsLeague[0];
    if (rareLeague) {
      const rareCount = Math.min(needsRare, rareLeague.needed, emptyCount);
      if (rareCount > 0) {
        criteria.push({
          league: rareLeague.league,
          quality: 'rare',
          minRating: getMinRatingForBuys(squad, requirements),
          maxPrice,
          quantity: rareCount,
        });
      }
    }
  }

  // Then: fill remaining with cheapest league-matching commons
  const alreadyBuying = criteria.reduce((s, c) => s + c.quantity, 0);
  const remainingToBuy = emptyCount - alreadyBuying;

  if (remainingToBuy > 0) {
    // Pick the league that still needs the most players
    const league = needsLeague[0]?.league ??
                   (requirements.leagueRequirements[0]?.leagueName ?? '');

    if (league) {
      criteria.push({
        league,
        minRating: getMinRatingForBuys(squad, requirements),
        maxPrice,
        quantity: remainingToBuy,
      });
    }
  }

  return criteria;
}

/** How many more rare/common players do we need? */
function getUnmetQualityCount(
  squad: (ClubPlayer | null)[],
  req: SBCRequirements,
  quality: string
): number {
  for (const qr of req.qualityRequirements) {
    if (qr.quality !== quality) continue;
    const current = squad.filter(p => {
      if (!p) return false;
      if (quality === 'rare') return p.isRare;
      if (quality === 'common') return !p.isRare;
      return p.quality === quality;
    }).length;
    return Math.max(0, qr.minCount - current);
  }
  return 0;
}

/** Which leagues still need more players, and how many? */
function getUnmetLeagueNeeds(
  squad: (ClubPlayer | null)[],
  req: SBCRequirements
): { league: string; needed: number }[] {
  return req.leagueRequirements
    .map(lr => {
      const current = squad.filter(p => p && p.league === lr.leagueName).length;
      return { league: lr.leagueName, needed: Math.max(0, lr.minCount - current) };
    })
    .filter(x => x.needed > 0)
    .sort((a, b) => b.needed - a.needed); // Most needed first
}

/**
 * If the SBC has a rating requirement, figure out what minimum rating
 * the purchased players need to be so the squad hits the target.
 */
function getMinRatingForBuys(
  squad: (ClubPlayer | null)[],
  req: SBCRequirements
): number | undefined {
  if (!req.minRating) return undefined;

  const currentRatings = squad.filter(Boolean).map(p => p!.rating);
  const remaining = squad.filter(p => p === null).length;
  if (remaining === 0) return undefined;

  const needed = requiredRatingForRemaining(currentRatings, req.minRating, remaining);
  // Only set minRating filter if it's meaningfully above minimum
  return needed > 62 ? needed : undefined;
}

// ========================================================================
//  BULK BUY CALCULATION (for repeat grinding)
// ========================================================================

/**
 * Calculates total players needed for N repeats of a set of SBC squads.
 * Sums up the buy lists across all squads and multiplies by repeat count.
 *
 * Used by the orchestrator before starting a bulk market session.
 */
export function calculateBulkBuyList(
  solverResults: SolverResult[],
  repeatCount: number
): MarketSearchCriteria[] {
  // Aggregate buy needs across all squads
  const aggregated = new Map<string, MarketSearchCriteria>();

  for (const result of solverResults) {
    for (const criteria of result.toBuy) {
      const key = `${criteria.league}|${criteria.quality ?? 'any'}|${criteria.minRating ?? 0}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.quantity += criteria.quantity;
      } else {
        aggregated.set(key, { ...criteria });
      }
    }
  }

  // Multiply by repeat count
  const bulkList: MarketSearchCriteria[] = [];
  for (const criteria of aggregated.values()) {
    bulkList.push({
      ...criteria,
      quantity: criteria.quantity * repeatCount,
    });
  }

  return bulkList;
}
