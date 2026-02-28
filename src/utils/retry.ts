import { log } from '../shared/logger';

/**
 * Retries an async function with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of attempts (default 3)
 * @param baseDelayMs - Initial delay between retries (default 1000ms)
 * @param shouldRetry - Optional predicate: return false to stop retrying on specific errors
 * @returns The result of fn, or throws the last error
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  shouldRetry?: (error: Error, attempt: number) => boolean
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;

      if (shouldRetry && !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        // Add jitter: ±25%
        const jitter = delay * 0.25 * (Math.random() * 2 - 1);
        const actualDelay = Math.round(delay + jitter);

        log(`Retry ${attempt + 1}/${maxRetries} after ${actualDelay}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }
    }
  }

  throw lastError;
}
