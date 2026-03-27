import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  createLocalExecutorEffect,
} from "../../../sdk-file/src/index";
import {
  defineExecutorSourcePlugin,
} from "../plugins";

const BrokenSourceInputSchema = Schema.Struct({
  name: Schema.String,
});

type BrokenSourceInput = typeof BrokenSourceInputSchema.Type;
type BrokenStoredSource = {
  readonly name: string;
};

const makeBrokenSourcePlugin = () => {
  const storage = new Map<string, BrokenStoredSource>();

  return defineExecutorSourcePlugin<
    "broken",
    BrokenSourceInput,
    BrokenSourceInput,
    BrokenSourceInput,
    BrokenStoredSource,
    {
      sourceId: string;
      config: BrokenSourceInput;
    },
    {
      createSource: (input: BrokenSourceInput) => Effect.Effect<any, Error, never>;
      getSource: (sourceId: string) => Effect.Effect<any, Error, never>;
    }
  >({
    key: "broken",
    source: {
      kind: "broken",
      displayName: "Broken",
      add: {
        inputSchema: BrokenSourceInputSchema,
        toConnectInput: (input) => input,
      },
      storage: {
        get: ({ sourceId }) => Effect.succeed(storage.get(sourceId) ?? null),
        put: ({ sourceId, value }) =>
          Effect.sync(() => {
            storage.set(sourceId, value);
          }),
        remove: ({ sourceId }) =>
          Effect.sync(() => {
            storage.delete(sourceId);
          }),
      },
      source: {
        create: (input) => ({
          source: {
            name: input.name,
            kind: "broken",
            status: "connected",
            enabled: true,
            namespace: "broken",
          },
          stored: {
            name: input.name,
          },
        }),
        update: ({ source, config }) => ({
          source: {
            ...source,
            name: config.name,
          },
          stored: {
            name: config.name,
          },
        }),
        toConfig: ({ stored }) => ({
          name: stored.name,
        }),
      },
      catalog: {
        kind: "imported",
        sync: () => Effect.fail(new Error("sync boom")),
        invoke: () => Effect.fail(new Error("invoke should not run in this test")),
      },
    },
    extendExecutor: ({ source }) => ({
      createSource: (input) => source.createSource(input),
      getSource: (sourceId) => source.getSource(sourceId),
    }),
  });
};

describe("source operations", () => {
  it.scoped("returns the errored source when source sync fails during create", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(join(tmpdir(), "executor-source-ops-"));

      const executor = yield* Effect.acquireRelease(
        createLocalExecutorEffect({
          localDataDir: ":memory:",
          workspaceRoot,
          plugins: [makeBrokenSourcePlugin()] as const,
        }),
        (executor) =>
          Effect.promise(() => executor.close()).pipe(
            Effect.orDie,
            Effect.zipRight(
              Effect.sync(() => {
                rmSync(workspaceRoot, {
                  recursive: true,
                  force: true,
                });
              }),
            ),
          ),
      );

      const created = yield* executor.broken.createSource({
          name: "Broken Source",
        });

      expect(created.status).toBe("error");

      const persisted = yield* executor.broken.getSource(created.id);

      expect(persisted.status).toBe("error");
      expect(persisted.name).toBe("Broken Source");
    }),
  );
});
