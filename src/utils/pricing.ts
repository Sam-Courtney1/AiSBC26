import type { ClubPlayer } from '../shared/types';
import { VALUATION } from '../shared/constants';

/**
 * Calculates the "effective cost" of using a player in an SBC.
 * Lower cost = should be used first.
 *
 * Based on SBC Monkey's approach:
 * - Untradeable duplicates: 10% of market value (burn these first)
 * - Regular untradeables: 70% of market value (can't sell, low cost)
 * - Tradeables: 100% of market value (you lose sell value)
 *
 * We approximate market value from rating since we don't always have
 * exact prices. Higher rated = more expensive = use lower rated first.
 */
export function playerUseCost(player: ClubPlayer): number {
  const baseValue = estimateValueFromRating(player.rating, player.isRare);

  if (player.isUntradeable && player.isDuplicate) {
    return baseValue * VALUATION.UNTRADEABLE_DUPLICATE;
  }
  if (player.isUntradeable) {
    return baseValue * VALUATION.UNTRADEABLE;
  }
  return baseValue * VALUATION.TRADEABLE;
}

/**
 * Rough market value estimate based on rating and rarity.
 * Used when we don't have cached FUTBIN prices.
 * These are ballpark figures for common/rare golds in FC 26.
 */
function estimateValueFromRating(rating: number, isRare: boolean): number {
  // Base estimates (coins) — will be improved with real price data later
  if (rating >= 88) return isRare ? 30000 : 20000;
  if (rating >= 86) return isRare ? 15000 : 10000;
  if (rating >= 84) return isRare ? 5000 : 3000;
  if (rating >= 83) return isRare ? 2500 : 1500;
  if (rating >= 82) return isRare ? 1500 : 1000;
  if (rating >= 80) return isRare ? 1000 : 700;
  if (rating >= 78) return isRare ? 700 : 500;
  if (rating >= 75) return isRare ? 500 : 350;
  return isRare ? 400 : 200;
}

/**
 * Sorts players by use cost (cheapest to use first).
 * This is the primary sort for the solver — it ensures we burn
 * untradeable dupes before untradeables before tradeables,
 * and within each category, lowest rated first.
 */
export function sortByUseCost(players: ClubPlayer[]): ClubPlayer[] {
  return [...players].sort((a, b) => playerUseCost(a) - playerUseCost(b));
}
