// ---------------------------------------------------------------------------
// Cloud ExecutorService — stateless, per-request executor from Postgres
// ---------------------------------------------------------------------------

import { Context, Effect } from "effect";

import { createExecutor, scopeKv } from "@executor/sdk";
import type { DrizzleDb } from "@executor/storage-postgres";
import type { Executor, ExecutorPlugin } from "@executor/sdk";
import { makePgConfig, makePgKv } from "@executor/storage-postgres";
import {
  openApiPlugin,
  makeKvOperationStore,
  type OpenApiPluginExtension,
} from "@executor/plugin-openapi";
import {
  mcpPlugin,
  makeKvBindingStore,
  type McpPluginExtension,
} from "@executor/plugin-mcp";
import {
  googleDiscoveryPlugin,
  makeKvBindingStore as makeKvGoogleDiscoveryBindingStore,
  type GoogleDiscoveryPluginExtension,
} from "@executor/plugin-google-discovery";
import {
  graphqlPlugin,
  makeKvOperationStore as makeKvGraphqlOperationStore,
  type GraphqlPluginExtension,
} from "@executor/plugin-graphql";
import {
  onepasswordPlugin,
  type OnePasswordExtension,
} from "@executor/plugin-onepassword";

import { AuthContext } from "../auth/context";

// ---------------------------------------------------------------------------
// Plugin types
// ---------------------------------------------------------------------------

type CloudPlugins = readonly [
  ExecutorPlugin<"openapi", OpenApiPluginExtension>,
  ExecutorPlugin<"mcp", McpPluginExtension>,
  ExecutorPlugin<"googleDiscovery", GoogleDiscoveryPluginExtension>,
  ExecutorPlugin<"graphql", GraphqlPluginExtension>,
  ExecutorPlugin<"onepassword", OnePasswordExtension>,
];

export type CloudExecutor = Executor<CloudPlugins>;

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class ExecutorService extends Context.Tag("ExecutorService")<
  ExecutorService,
  CloudExecutor
>() {}

// ---------------------------------------------------------------------------
// Create a fresh executor for a team (stateless, per-request)
// ---------------------------------------------------------------------------

export const createTeamExecutor = (
  db: DrizzleDb,
  teamId: string,
  teamName: string,
  encryptionKey: string,
) =>
  Effect.gen(function* () {
    const kv = makePgKv(db, teamId);
    const config = makePgConfig(db, {
      teamId,
      teamName,
      encryptionKey,
      plugins: [
        openApiPlugin({
          operationStore: makeKvOperationStore(kv, "openapi"),
        }),
        mcpPlugin({
          bindingStore: makeKvBindingStore(kv, "mcp"),
        }),
        googleDiscoveryPlugin({
          bindingStore: makeKvGoogleDiscoveryBindingStore(kv, "google-discovery"),
        }),
        graphqlPlugin({
          operationStore: makeKvGraphqlOperationStore(kv, "graphql"),
        }),
        onepasswordPlugin({
          kv: scopeKv(kv, "onepassword"),
        }),
      ] as const,
    });

    return yield* createExecutor(config);
  });
