import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  loadLocalExecutorConfig,
  resolveLocalWorkspaceContext,
} from "./local-config";

const makeWorkspaceRoot = () =>
  mkdtempSync(join(tmpdir(), "executor-local-config-"));

describe("local-config", () => {
  it.effect("parses jsonc project config with comments and trailing commas", () =>
    Effect.gen(function* () {
      const workspaceRoot = makeWorkspaceRoot();
      const configDirectory = join(workspaceRoot, ".executor");
      yield* Effect.promise(() => mkdir(configDirectory, { recursive: true }));
      yield* Effect.promise(() =>
        writeFile(
          join(configDirectory, "executor.jsonc"),
          `{
  // local workspace config
  "sources": {
    "github": {
      "kind": "openapi",
      "connection": {
        "endpoint": "https://api.github.com",
      },
      "binding": {
        "specUrl": "https://example.com/openapi.json",
      },
    },
  },
}
`,
          "utf8",
        ),
      );

      const context = yield* Effect.promise(() =>
        resolveLocalWorkspaceContext({ workspaceRoot }),
      );
      const loaded = yield* Effect.promise(() =>
        loadLocalExecutorConfig(context),
      );

      expect(loaded.config?.sources?.github?.kind).toBe("openapi");
      expect(loaded.config?.sources?.github?.connection.endpoint).toBe(
        "https://api.github.com",
      );
    }),
  );

  it.effect("reports jsonc syntax errors with line and column details", () =>
    Effect.gen(function* () {
      const workspaceRoot = makeWorkspaceRoot();
      const configDirectory = join(workspaceRoot, ".executor");
      yield* Effect.promise(() => mkdir(configDirectory, { recursive: true }));
      yield* Effect.promise(() =>
        writeFile(
          join(configDirectory, "executor.jsonc"),
          `{
  "sources": {
    "github": {
      "kind": "openapi"
      "connection": {
        "endpoint": "https://api.github.com"
      }
    }
  }
}
`,
          "utf8",
        ),
      );

      const context = yield* Effect.promise(() =>
        resolveLocalWorkspaceContext({ workspaceRoot }),
      );
      const failure = yield* Effect.flip(
        Effect.tryPromise({
          try: () => loadLocalExecutorConfig(context),
          catch: (cause) =>
            cause instanceof Error ? cause : new Error(String(cause)),
        }),
      );

      expect(failure.message).toContain("Invalid executor config");
      expect(failure.message).toContain("line 5, column 7");
    }),
  );
});
