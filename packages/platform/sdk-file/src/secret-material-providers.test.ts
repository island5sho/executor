import { join } from "node:path";

import {
  FileSystem,
} from "@effect/platform";
import {
  NodeFileSystem,
} from "@effect/platform-node";
import {
  describe,
  expect,
  it,
} from "@effect/vitest";
import {
  registerExecutorSdkPlugins,
} from "@executor/platform-sdk/plugins";
import type {
  SecretMaterial,
  SecretStore,
} from "@executor/platform-sdk/schema";
import * as Effect from "effect/Effect";

import {
  LOCAL_SECRET_STORE_ID,
  localSecretStoreSdkPlugin,
} from "../../../../plugins/local-secret-store/sdk";
import {
  resolveLocalWorkspaceContext,
} from "./config";
import {
  createLocalExecutorStateStore,
} from "./executor-state-store";
import {
  createDefaultSecretMaterialResolver,
} from "./secret-material-providers";

describe("secret material providers", () => {
  it.scoped("resolves secret values through secret store contributions without ambient ExecutorStateStore", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspaceRoot = yield* fs.makeTempDirectory({
        prefix: "executor-secret-material-",
      });
      const homeStateDirectory = join(workspaceRoot, ".home");
      const context = yield* resolveLocalWorkspaceContext({
        workspaceRoot,
        homeConfigPath: join(workspaceRoot, "executor.home.jsonc"),
        homeStateDirectory,
      });
      const executorState = createLocalExecutorStateStore(context, fs);
      const pluginRegistry = registerExecutorSdkPlugins([
        localSecretStoreSdkPlugin,
      ]);

      const now = Date.now();
      const store: SecretStore = {
        id: LOCAL_SECRET_STORE_ID as SecretStore["id"],
        scopeId: "scope_test" as SecretStore["scopeId"],
        kind: "local",
        name: "Local Store",
        status: "connected",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      const secret: SecretMaterial = {
        id: "sec_test" as SecretMaterial["id"],
        storeId: store.id,
        name: "Demo Secret",
        purpose: "auth_material",
        createdAt: now,
        updatedAt: now,
      };

      yield* executorState.secretStores.upsert(store);
      yield* executorState.secretMaterials.upsert(secret);
      yield* executorState.secretMaterialStoredData.upsert({
        secretId: secret.id,
        data: {
          value: "token-from-secret-store",
        },
      });

      const resolveSecretMaterial = createDefaultSecretMaterialResolver({
        executorState,
        pluginRegistry,
      });

      const resolved = yield* resolveSecretMaterial({
        ref: {
          secretId: secret.id,
        },
      });

      expect(resolved).toBe("token-from-secret-store");
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
