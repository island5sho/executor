import { calculateBackoff, delay, withTimeout } from "./utils";
import type { RetryOptions, ExecutorError } from "./types";

/**
 * Default retry options used when none are provided.
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 30000,
  backoffFactor: 2,
  jitter: true,
  timeout: 0,
  retryOn: () => true,
};

/**
 * Determines whether a given error should trigger a retry based on the
 * provided `retryOn` predicate or list of error types.
 */
function shouldRetry(
  error: unknown,
  retryOn: RetryOptions["retryOn"]
): boolean {
  if (!retryOn) return true;

  if (typeof retryOn === "function") {
    return retryOn(error);
  }

  if (Array.isArray(retryOn)) {
    return retryOn.some(
      (ErrorClass) => error instanceof ErrorClass
    );
  }

  return true;
}

/**
 * Executes an async function with automatic retry logic.
 *
 * @param fn - The async function to execute.
 * @param options - Retry configuration options.
 * @returns The resolved value of `fn` on success.
 * @throws The last encountered error after all attempts are exhausted.
 *
 * @example
 * const result = await withRetry(
 *   () => fetch("https://api.example.com/data"),
 *   { maxAttempts: 5, initialDelay: 200 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts: Required<RetryOptions> = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: unknown;
  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    attempt++;

    try {
      const result =
        opts.timeout > 0
          ? await withTimeout(fn(), opts.timeout)
          : await fn();

      return result;
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt >= opts.maxAttempts;

      if (isLastAttempt || !shouldRetry(error, opts.retryOn)) {
        break;
      }

      const backoff = calculateBackoff(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffFactor,
        opts.jitter
      );

      await delay(backoff);
    }
  }

  throw lastError;
}

/**
 * Creates a reusable retry wrapper with pre-configured options.
 *
 * @param options - Default retry options for the created wrapper.
 * @returns A function that wraps an async operation with retry logic.
 *
 * @example
 * const retryFetch = createRetry({ maxAttempts: 3, initialDelay: 500 });
 * const data = await retryFetch(() => fetchData());
 */
export function createRetry(options: RetryOptions = {}) {
  return function retry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, options);
  };
}
