import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";

import { RuntimeAdapterError } from "@executor-v2/engine";
import { makeCloudflareWorkerLoaderRuntimeAdapter } from "./index";

type WorkerProcess = ReturnType<typeof spawn>;

const getFreePort = async (): Promise<number> =>
  await new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to resolve free port"));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });

    server.on("error", (error) => {
      reject(error);
    });
  });

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForWorker = async (baseUrl: string, timeoutMs = 30_000): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // Keep waiting while worker process starts.
    }

    await wait(200);
  }

  throw new Error(`Timed out waiting for worker health at ${baseUrl}/health`);
};

const stopWorkerProcess = async (process: WorkerProcess): Promise<void> =>
  await new Promise<void>((resolve) => {
    if (process.killed || process.exitCode !== null) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      process.kill("SIGKILL");
      resolve();
    }, 3_000);

    process.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    process.kill("SIGTERM");
  });

describe("cloudflare worker loader runtime adapter integration", () => {
  let workerProcess: WorkerProcess | null = null;
  let workerPort = 0;
  let workerBaseUrl = "";

  beforeAll(async () => {
    workerPort = await getFreePort();
    workerBaseUrl = `http://127.0.0.1:${workerPort}`;

    const workerDir = fileURLToPath(new URL("../test-worker", import.meta.url));

    const spawned = spawn(
      "bunx",
      [
        "wrangler",
        "dev",
        "--local",
        "--port",
        String(workerPort),
        "--config",
        "wrangler.jsonc",
        "--log-level",
        "error",
      ],
      {
        cwd: workerDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    workerProcess = spawned;

    spawned.stdout?.on("data", () => {
      // Ignore stdout, but keep stream flowing.
    });

    spawned.stderr?.on("data", () => {
      // Keep stream flowing.
    });

    await waitForWorker(workerBaseUrl, 45_000);
  });

  afterAll(async () => {
    if (workerProcess) {
      await stopWorkerProcess(workerProcess);
    }
  });

  it.effect("executes against a real local Cloudflare Worker process", () =>
    Effect.gen(function* () {
      const adapter = makeCloudflareWorkerLoaderRuntimeAdapter({
        runUrl: `${workerBaseUrl}/v1/runs?scenario=completed`,
        authToken: "sandbox-token",
        callbackUrl: "https://callbacks.example.test/runtimeCallbacks",
        callbackInternalSecret: "internal-token",
      });

      const result = yield* adapter.execute({
        runId: "run_e2e_1",
        code: "return 42;",
      });

      expect(result).toMatchObject({
        echoedRunId: "run_e2e_1",
        callback: {
          url: "https://callbacks.example.test/runtimeCallbacks",
          internalSecret: "internal-token",
        },
      });
    }),
  );

  it.effect("maps worker terminal failures across the HTTP boundary", () =>
    Effect.gen(function* () {
      const adapter = makeCloudflareWorkerLoaderRuntimeAdapter({
        runUrl: `${workerBaseUrl}/v1/runs?scenario=failed`,
        authToken: "sandbox-token",
        callbackUrl: "https://callbacks.example.test/runtimeCallbacks",
      });

      const result = yield* Effect.either(
        adapter.execute({
          runId: "run_e2e_2",
          code: "return 0;",
        }),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(RuntimeAdapterError);
        expect(result.left.operation).toBe("execute_terminal");
        expect(result.left.message).toContain("failed");
        expect(result.left.details).toBe("tool call denied");
      }
    }),
  );

  it.effect("surfaces non-200 responses as dispatch errors", () =>
    Effect.gen(function* () {
      const adapter = makeCloudflareWorkerLoaderRuntimeAdapter({
        runUrl: `${workerBaseUrl}/v1/runs?scenario=http-500`,
        authToken: "sandbox-token",
        callbackUrl: "https://callbacks.example.test/runtimeCallbacks",
      });

      const result = yield* Effect.either(
        adapter.execute({
          runId: "run_e2e_3",
          code: "return 0;",
        }),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.operation).toBe("dispatch");
        expect(result.left.message).toContain("500");
      }
    }),
  );

  it.effect("surfaces invalid JSON from worker as decode errors", () =>
    Effect.gen(function* () {
      const adapter = makeCloudflareWorkerLoaderRuntimeAdapter({
        runUrl: `${workerBaseUrl}/v1/runs?scenario=invalid-json`,
        authToken: "sandbox-token",
        callbackUrl: "https://callbacks.example.test/runtimeCallbacks",
      });

      const result = yield* Effect.either(
        adapter.execute({
          runId: "run_e2e_4",
          code: "return 0;",
        }),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.operation).toBe("decode_response");
      }
    }),
  );
});
