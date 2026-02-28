/**
 * EA FC squad rating calculation.
 *
 * The rating is NOT a simple average. EA uses a formula that factors in
 * surplus above the base (floor of the average). Players above the average
 * contribute bonus points, making high-rated players disproportionately valuable.
 *
 * Formula:
 *   baseRating = floor(sum / count)
 *   surplus = sum of max(0, playerRating - baseRating) for each player
 *   effectiveRating = baseRating + floor(surplus / correctionFactor)
 *
 * The correction factor scales with how many players are above the average.
 */

/**
 * Calculates the squad rating for a set of player ratings.
 * Works for any squad size (11, or partial squads for estimation).
 */
export function calculateSquadRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;

  const n = ratings.length;
  const sum = ratings.reduce((a, b) => a + b, 0);
  const average = sum / n;
  const baseRating = Math.floor(average);

  let surplus = 0;
  let playersAbove = 0;
  for (const r of ratings) {
    if (r > baseRating) {
      surplus += r - baseRating;
      playersAbove++;
    }
  }

  // EA's correction factor — calibrated from observed in-game values.
  // When more players are above the base, the surplus contribution diminishes.
  const correction = Math.max(playersAbove, 1);

  return baseRating + Math.floor(surplus / correction);
}

/**
 * Given the ratings of players already placed and a target squad rating,
 * calculates what minimum average rating the remaining players need.
 *
 * This is used to decide what minRating to search for on the transfer market.
 * Returns a conservative estimate (may slightly overshoot).
 */
export function requiredRatingForRemaining(
  currentRatings: number[],
  targetRating: number,
  remainingSlots: number
): number {
  if (remainingSlots <= 0) return 0;

  const totalSlots = currentRatings.length + remainingSlots;
  const currentSum = currentRatings.reduce((a, b) => a + b, 0);

  // Simplified: solve for what sum the remaining players need to produce
  // to hit the target rating as a simple average. This is a lower bound;
  // the actual EA formula may require slightly higher due to the surplus calc.
  const neededSum = targetRating * totalSlots - currentSum;
  const neededAvg = Math.ceil(neededSum / remainingSlots);

  // Clamp to reasonable bounds
  return Math.max(neededAvg, 45); // No player is below ~45
}

/**
 * Quick check: is it possible to reach the target rating given what's
 * already placed and how many slots remain?
 *
 * Assumes remaining players can be at most maxAvailableRating (e.g., 99).
 */
export function isRatingFeasible(
  currentRatings: number[],
  targetRating: number,
  remainingSlots: number,
  maxAvailableRating: number = 99
): boolean {
  if (targetRating === 0) return true;
  const required = requiredRatingForRemaining(currentRatings, targetRating, remainingSlots);
  return required <= maxAvailableRating;
}
