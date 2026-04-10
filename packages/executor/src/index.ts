/**
 * executor - A TypeScript-first task execution library
 * 
 * Provides utilities for running tasks with retry logic, timeouts,
 * concurrency control, and structured error handling.
 */

export type ExecutorOptions = {
  /** Maximum number of retry attempts (default: 0) */
  retries?: number;
  /** Delay in ms between retries (default: 100) */
  retryDelay?: number;
  /** Timeout in ms before task is aborted (default: none) */
  timeout?: number;
  /** Optional label for logging/tracing */
  label?: string;
};

export type ExecutorResult<T> =
  | { success: true; data: T; attempts: number; durationMs: number }
  | { success: false; error: unknown; attempts: number; durationMs: number };

/**
 * Executes an async task with optional retry logic and timeout support.
 *
 * @param task - Async function to execute
 * @param options - Configuration for retries, delay, and timeout
 * @returns A structured result object with success/failure info
 *
 * @example
 * const result = await execute(() => fetchUser(userId), { retries: 3, timeout: 5000 });
 * if (result.success) {
 *   console.log(result.data);
 * }
 */
export async function execute<T>(
  task: () => Promise<T>,
  options: ExecutorOptions = {}
): Promise<ExecutorResult<T>> {
  // Default retryDelay to 100ms instead of 0 — immediate retries hammer the service
  const { retries = 0, retryDelay = 100, timeout, label } = options;
  const maxAttempts = retries + 1;
  const startTime = Date.now();

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let taskPromise = task();

      if (timeout !== undefined) {
        taskPromise = Promise.race([
          taskPromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Task${label ? ` "${label}"` : ''} timed out after ${timeout}ms`)),
              timeout
            )
          ),
        ]);
      }

      const data = await taskPromise;
      return {
        success: true,
        data,
        attempts: attempt,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err;

      if (attempt < maxAttempts && retryDelay > 0) {
        await delay(retryDelay);
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxAttempts,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Executes multiple tasks with a concurrency limit.
 *
 * @param tasks - Array of async task functions
 * @param concurrency - Maximum number of tasks to run simultaneously
 * @returns Array of executor results in the same order as input tasks
 */
export async function executeAll<T>(
  tasks: Array<() => Promise<T>>,
  concurrency = Infinity,
  options: ExecutorOptions = {}
): Promise<Array<ExecutorResult<T>>> {
  const results: Array<ExecutorResult<T>> = new Array(tasks.length);
  const queue = tasks.map((task, index) => ({ task, index }));
  const inFlight: Promise<void>[] = [];

  async function runNext(): Promise<void> {
    const item = queue.shift();
    if (!item) return;
    resul