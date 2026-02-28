import type { CachedPrice } from '../shared/types';
import { PRICE_CACHE_TTL_MS } from '../shared/constants';
import { log } from '../shared/logger';

const STORAGE_KEY = 'priceCache';

// ========================================================================
//  CACHE LAYER
// ========================================================================

/**
 * Retrieves a cached price if it exists and hasn't expired.
 * Cache key is league + quality combination.
 */
export async function getCachedPrice(
  league: string,
  quality: string = 'any'
): Promise<CachedPrice | null> {
  const key = cacheKey(league, quality);

  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const cache: Record<string, CachedPrice> = (data[STORAGE_KEY] ?? {}) as Record<string, CachedPrice>;
    const entry = cache[key];

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.fetchedAt > PRICE_CACHE_TTL_MS) {
      // Expired — clean up
      delete cache[key];
      await chrome.storage.local.set({ [STORAGE_KEY]: cache });
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

/**
 * Stores a price in the cache.
 */
export async function setCachedPrice(price: CachedPrice): Promise<void> {
  const key = cacheKey(price.league, price.quality);

  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const cache: Record<string, CachedPrice> = (data[STORAGE_KEY] ?? {}) as Record<string, CachedPrice>;
    cache[key] = price;
    await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  } catch {
    // Storage failure is non-critical
  }
}

/**
 * Clears all cached prices.
 */
export async function clearPriceCache(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

function cacheKey(league: string, quality: string): string {
  return `${league.toLowerCase()}|${quality.toLowerCase()}`;
}

// ========================================================================
//  EXTERNAL PRICE FETCHING
// ========================================================================

/**
 * Fetches current market price data from FUTBIN for a given league + quality.
 *
 * This is a placeholder implementation. FUTBIN doesn't have a public API,
 * so the actual implementation will need to either:
 * 1. Scrape FUTBIN pages (may break if they change layout)
 * 2. Use their internal API endpoints (undocumented, may need headers)
 * 3. Use an alternative source like Futwiz or FUTGG
 *
 * For now, we provide the interface and fall back to estimate-based pricing.
 * This can be swapped in once we identify the best data source.
 */
export async function fetchExternalPrice(
  league: string,
  quality: string = 'any'
): Promise<CachedPrice | null> {
  // Check cache first
  const cached = await getCachedPrice(league, quality);
  if (cached) return cached;

  // TODO: Implement actual FUTBIN/Futwiz fetch
  // For now, return null to signal "use fallback estimation"
  //
  // Future implementation sketch:
  //
  // const url = buildFutbinUrl(league, quality);
  // try {
  //   const response = await fetch(url);
  //   const data = await response.json();
  //   const price: CachedPrice = {
  //     league,
  //     quality,
  //     avgPrice: data.avgPrice,
  //     minPrice: data.minPrice,
  //     fetchedAt: Date.now(),
  //   };
  //   await setCachedPrice(price);
  //   return price;
  // } catch (err) {
  //   log(`External price fetch failed: ${(err as Error).message}`);
  //   return null;
  // }

  log(`No external price data for ${league}/${quality} — using fallback`);
  return null;
}

/**
 * Gets a recommended max BIN price for market searches.
 *
 * Strategy:
 * 1. If we have cached external data, use that + 10% buffer
 * 2. Otherwise, use the user's configured maxPricePerPlayer
 *
 * The buffer prevents missing listings due to slight price fluctuations.
 */
export async function getRecommendedMaxPrice(
  league: string,
  quality: string = 'any',
  userMaxPrice: number = 1500
): Promise<number> {
  const priceData = await fetchExternalPrice(league, quality);

  if (priceData && priceData.avgPrice > 0) {
    // Use external data + 10% buffer, but don't exceed user's max
    const recommended = Math.round(priceData.avgPrice * 1.1);
    return Math.min(recommended, userMaxPrice);
  }

  // Fallback to user's configured max
  return userMaxPrice;
}

/**
 * After a successful market search, caches the observed prices.
 * Called by the transfer market module after each search to keep
 * the cache fresh with real data even without external API access.
 */
export async function cacheObservedPrices(
  league: string,
  quality: string,
  prices: number[]
): Promise<void> {
  if (prices.length === 0) return;

  const min = Math.min(...prices);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

  await setCachedPrice({
    league,
    quality: quality || 'any',
    avgPrice: avg,
    minPrice: min,
    fetchedAt: Date.now(),
  });
}
