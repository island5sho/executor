import { Context, Effect, Layer } from "effect";
import { createExecutor, makeTestConfig } from "@executor/sdk";

import type { Executor } from "@executor/sdk";

// ---------------------------------------------------------------------------
// Service tag — provides the executor instance to HTTP handlers
// ---------------------------------------------------------------------------

export class ExecutorService extends Context.Tag("ExecutorService")<
  ExecutorService,
  Executor
>() {}

// ---------------------------------------------------------------------------
// Default layer — creates an in-memory executor
// ---------------------------------------------------------------------------

export const ExecutorServiceLive = Layer.effect(
  ExecutorService,
  createExecutor(makeTestConfig()),
);
