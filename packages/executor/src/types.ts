/**
 * Core type definitions for the executor package.
 * These types define the shape of tasks, results, and configuration
 * used throughout the executor system.
 */

/**
 * Represents the possible states of an executor task.
 */
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
 * Configuration options for creating an executor instance.
 */
export interface ExecutorConfig {
  /** Maximum number of concurrent tasks allowed */
  concurrency?: number;
  /** Timeout in milliseconds for each task (0 = no timeout) */
  timeout?: number;
  /** Number of retry attempts on failure */
  retries?: number;
  /** Delay in milliseconds between retry attempts */
  retryDelay?: number;
  /** Whether to throw on first failure or collect all errors */
  failFast?: boolean;
  /** Whether to log task lifecycle events to console (useful for debugging) */
  debug?: boolean;
  /** Whether to include cancelled tasks in the failed array of BatchResult */
  includeCancelledInFailed?: boolean;
  /**
   * Whether to preserve task insertion order in BatchResult.results.
   * Defaults to false (results are returned in completion order).
   * Set to true if you need results to match the order tasks were submitted.
   */
  preserveOrder?: boolean;
}

/**
 * Represents a single task to be executed.
 */
export interface Task<TInput = unknown, TOutput = unknown> {
  /** Unique identifier for the task */
  id: string;
  /** The function to execute */
  fn: (input: TInput) => Promise<TOutput> | TOutput;
  /** Input data passed to the task function */
  input?: TInput;
  /** Optional task-level timeout override (ms) */
  timeout?: number;
  /** Optional task-level retry override */
  retries?: number;
  /** Metadata attached to the task */
  meta?: Record<string, unknown>;
}

/**
 * The result of a completed or failed task execution.
 */
export interface TaskResult<TOutput = unknown> {
  /** The task ID this result belongs to */
  taskId: string;
  /** Final status of the task */
  status: Extract<TaskStatus, "completed" | "failed" | "cancelled">;
  /** Output value if the task completed successfully */
  output?: TOutput;
  /** Error if the task failed */
  error?: Error;
  /** Duration of the task execution in milliseconds */
  durationMs: number;
  /** Number of attempts made */
  attempts: number;
  /** Timestamp when the task started */
  startedAt: Date;
  /** Timestamp when the task finished */
  finishedAt: Date;
}

/**
 * Represents a batch of tasks submitted for execution.
 */
export interface BatchResult<TOutput = unknown> {
  /** Results for all tasks in the batch */
  results: TaskResult<TOutput>[];
  /** Tasks that completed successfully */
  succeeded: TaskResult<TOutput>[];
  /** Tasks that failed */
  failed: TaskResult<TOutput>[];
  /** Tasks that were cancelled - useful to distinguish from actual failures */
  cancelled: TaskResult<TOutput>[];
  /** Total wall-clock duration for the batch in milliseconds */
  totalDurationMs: number;
}

/**
 * Event emitted during task lifecycle changes.
 */
export interface TaskEvent<TOutput = unknown> {
  type: "task:start" | "task:complete" | "task:fail" | "task:retry" | "task:cancel";
  taskId: string;
  timestamp: Date;
  result?: TaskResult<TOutput>;
}
