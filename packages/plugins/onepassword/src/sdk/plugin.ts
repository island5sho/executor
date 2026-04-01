import { Effect, Schema } from "effect";
import type { Client } from "@1password/sdk";

import {
  definePlugin,
  type ExecutorPlugin,
  type PluginContext,
  type SecretProvider,
  type ScopedKv,
  SecretId,
} from "@executor/sdk";

import { OnePasswordConfig, Vault, ConnectionStatus } from "./types";
import type { OnePasswordAuth } from "./types";
import { OnePasswordError } from "./errors";
import { make1PClient, withTimeout, type ResolvedAuth } from "./client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_KEY = "onepassword";
const CREDENTIAL_FIELD = "credential";
const DEFAULT_TIMEOUT_MS = 15_000;
const CONFIG_KEY = "config";

// ---------------------------------------------------------------------------
// Plugin extension — public API on executor.onepassword
// ---------------------------------------------------------------------------

export interface OnePasswordExtension {
  /** Configure the 1Password connection */
  readonly configure: (
    config: OnePasswordConfig,
  ) => Effect.Effect<void, OnePasswordError>;

  /** Get current configuration (if any) */
  readonly getConfig: () => Effect.Effect<OnePasswordConfig | null, OnePasswordError>;

  /** Remove the 1Password configuration */
  readonly removeConfig: () => Effect.Effect<void>;

  /** Check connection status */
  readonly status: () => Effect.Effect<ConnectionStatus, OnePasswordError>;

  /** List accessible vaults (requires auth) */
  readonly listVaults: (
    auth: OnePasswordAuth,
  ) => Effect.Effect<ReadonlyArray<Vault>, OnePasswordError>;

  /** Resolve a secret directly by op:// URI */
  readonly resolve: (uri: string) => Effect.Effect<string, OnePasswordError>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resolveAuth = (
  auth: OnePasswordAuth,
  ctx: PluginContext,
): Effect.Effect<ResolvedAuth, OnePasswordError> => {
  if (auth.kind === "desktop-app") {
    return Effect.succeed({
      kind: "desktop-app" as const,
      accountName: auth.accountName,
    });
  }
  return ctx.secrets.resolve(SecretId.make(auth.tokenSecretId), ctx.scope.id).pipe(
    Effect.map(
      (token): ResolvedAuth => ({ kind: "service-account", token }),
    ),
    Effect.mapError(
      (e) =>
        new OnePasswordError({
          operation: "auth resolution",
          message: `Failed to resolve service account token secret "${auth.tokenSecretId}": ${e._tag}`,
        }),
    ),
  );
};

const getClientFromConfig = (
  config: OnePasswordConfig,
  ctx: PluginContext,
  timeoutMs: number,
): Effect.Effect<Client, OnePasswordError> =>
  resolveAuth(config.auth, ctx).pipe(
    Effect.flatMap((resolved) => make1PClient(resolved, timeoutMs)),
  );

// ---------------------------------------------------------------------------
// SecretProvider — read-only, resolves op:// URIs or vaultId-based lookups
// ---------------------------------------------------------------------------

const makeProvider = (
  getConfig: () => Effect.Effect<OnePasswordConfig | null, OnePasswordError>,
  ctx: PluginContext,
  timeoutMs: number,
): SecretProvider => ({
  key: "onepassword",
  writable: false,

  get: (secretId) =>
    getConfig().pipe(
      Effect.flatMap((config) => {
        if (!config) return Effect.succeed(null);

        const uri = secretId.startsWith("op://")
          ? secretId
          : `op://${config.vaultId}/${secretId}/${CREDENTIAL_FIELD}`;

        return getClientFromConfig(config, ctx, timeoutMs).pipe(
          Effect.flatMap((client) =>
            Effect.tryPromise({
              try: () =>
                withTimeout(
                  "secret resolution",
                  () => client.secrets.resolve(uri),
                  timeoutMs,
                ),
              catch: (cause) =>
                new OnePasswordError({
                  operation: "secret resolution",
                  message:
                    cause instanceof Error ? cause.message : String(cause),
                }),
            }),
          ),
          Effect.map((v): string | null => v),
          Effect.orElseSucceed(() => null),
        );
      }),
      Effect.orElseSucceed(() => null),
    ),
});

// ---------------------------------------------------------------------------
// Config persistence via ScopedKv
// ---------------------------------------------------------------------------

const decodeConfig = Schema.decodeUnknownSync(OnePasswordConfig);

const loadConfig = (kv: ScopedKv): Effect.Effect<OnePasswordConfig | null, OnePasswordError> =>
  kv.get(CONFIG_KEY).pipe(
    Effect.flatMap((v) => {
      if (v === null) return Effect.succeed(null);
      return Effect.try(() => decodeConfig(JSON.parse(v))).pipe(
        Effect.mapError(
          (cause) =>
            new OnePasswordError({
              operation: "config decode",
              message:
                cause instanceof Error ? cause.message : String(cause),
            }),
        ),
      );
    }),
  );

const saveConfig = (
  kv: ScopedKv,
  config: OnePasswordConfig,
): Effect.Effect<void> =>
  kv.set(CONFIG_KEY, JSON.stringify({
    auth: config.auth,
    vaultId: config.vaultId,
    name: config.name,
  }));

const deleteConfig = (kv: ScopedKv): Effect.Effect<void> => kv.delete(CONFIG_KEY);

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export interface OnePasswordPluginOptions {
  /** Scoped KV for persisting config (provided by server) */
  readonly kv: ScopedKv;
  /** Request timeout in ms (default: 15000) */
  readonly timeoutMs?: number;
}

export const onepasswordPlugin = (
  options: OnePasswordPluginOptions,
): ExecutorPlugin<typeof PLUGIN_KEY, OnePasswordExtension> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const kv = options.kv;

  return definePlugin({
    key: PLUGIN_KEY,
    init: (ctx) =>
      Effect.gen(function* () {
        // Config accessor (reads from KV each time — always fresh)
        const getConfig = () => loadConfig(kv);

        // Register as secret provider
        yield* ctx.secrets.addProvider(
          makeProvider(getConfig, ctx, timeoutMs),
        );

        const extension: OnePasswordExtension = {
          configure: (config) =>
            saveConfig(kv, config),

          getConfig: () => getConfig(),

          removeConfig: () => deleteConfig(kv),

          status: () =>
            Effect.gen(function* () {
              const config = yield* getConfig();
              if (!config) {
                return new ConnectionStatus({
                  connected: false,
                  error: "Not configured",
                });
              }
              // Try to list vaults as a health check
              const client = yield* getClientFromConfig(config, ctx, timeoutMs);
              const vaults = yield* Effect.tryPromise({
                try: () =>
                  withTimeout(
                    "connection check",
                    () => client.vaults.list({ decryptDetails: true }),
                    timeoutMs,
                  ),
                catch: (cause) =>
                  new OnePasswordError({
                    operation: "connection check",
                    message:
                      cause instanceof Error
                        ? cause.message
                        : String(cause),
                  }),
              });
              const vault = vaults.find((v) => v.id === config.vaultId);
              return new ConnectionStatus({
                connected: true,
                vaultName: vault?.title,
              });
            }),

          listVaults: (auth) =>
            Effect.gen(function* () {
              const resolved = yield* resolveAuth(auth, ctx);
              const client = yield* make1PClient(resolved, timeoutMs);
              const vaults = yield* Effect.tryPromise({
                try: () =>
                  withTimeout(
                    "vault listing",
                    () => client.vaults.list({ decryptDetails: true }),
                    timeoutMs,
                  ),
                catch: (cause) =>
                  new OnePasswordError({
                    operation: "vault listing",
                    message:
                      cause instanceof Error
                        ? cause.message
                        : String(cause),
                  }),
              });
              return vaults
                .map((v) => new Vault({ id: v.id, name: v.title }))
                .sort((a, b) => a.name.localeCompare(b.name));
            }),

          resolve: (uri) =>
            Effect.gen(function* () {
              const config = yield* getConfig();
              if (!config) {
                return yield* new OnePasswordError({
                  operation: "resolve",
                  message: "1Password is not configured",
                });
              }
              const client = yield* getClientFromConfig(config, ctx, timeoutMs);
              return yield* Effect.tryPromise({
                try: () =>
                  withTimeout(
                    "secret resolution",
                    () => client.secrets.resolve(uri),
                    timeoutMs,
                  ),
                catch: (cause) =>
                  new OnePasswordError({
                    operation: "secret resolution",
                    message:
                      cause instanceof Error
                        ? cause.message
                        : String(cause),
                  }),
              });
            }),
        };

        return { extension };
      }),
  });
};
