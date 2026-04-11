/**
 * Utility functions for the executor package.
 * Provides helpers for task scheduling, retry logic, and error handling.
 */

import type { ExecutorTask, ExecutorOptions, ExecutorResult } from './types';

/**
 * Creates a delay promise that resolves after the specified milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates the backoff delay for retry attempts using exponential backoff.
 * @param attempt - The current attempt number (0-indexed)
 * @param baseDelay - The base delay in milliseconds
 * @param maxDelay - The maximum delay cap in milliseconds
 */
export function calculateBackoff(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * exponential;
  return Math.min(exponential + jitter, maxDelay);
}

/**
 * Wraps a task function with retry logic.
 * @param fn - The async function to wrap
 * @param retries - Number of retry attempts
 * @param baseDelay - Base delay between retries in milliseconds
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const backoff = calculateBackoff(attempt, baseDelay);
        await delay(backoff);
      }
    }
  }

  throw lastError;
}

/**
 * Creates a timeout wrapper for a promise.
 * Rejects with a TimeoutError if the promise doesn't resolve within the given time.
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout duration in milliseconds
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Task timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

/**
 * Checks whether a value is a non-null object.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely serializes an error to a plain object for logging or transport.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (isObject(error)) {
    return error;
  }
  return { message: String(error) };
}

/**
 * Generates a unique task ID using a timestamp and random suffix.
 */
export function generateTaskId(prefix: string = 'task'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Merges executor options with sensible defaults.
 */
export function mergeWithDefaults<T extends Partial<ExecutorOptions>>(
  options: T,
  defaults: ExecutorOptions
): ExecutorOptions {
  return { ...defaults, ...options };
}
