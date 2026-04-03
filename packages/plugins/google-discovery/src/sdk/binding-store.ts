import { Effect, Schema } from "effect";
import {
  makeInMemoryScopedKv,
  scopeKv,
  type Kv,
  type ScopedKv,
  type ToolId,
} from "@executor/sdk";

import {
  GoogleDiscoveryMethodBinding,
  GoogleDiscoveryStoredSourceData,
} from "./types";

const StoredBindingEntry = Schema.Struct({
  namespace: Schema.String,
  binding: GoogleDiscoveryMethodBinding,
});

const encodeBindingEntry = Schema.encodeSync(
  Schema.parseJson(StoredBindingEntry),
);
const decodeBindingEntry = Schema.decodeUnknownSync(
  Schema.parseJson(StoredBindingEntry),
);
const encodeSourceData = Schema.encodeSync(
  Schema.parseJson(GoogleDiscoveryStoredSourceData),
);
const decodeSourceData = Schema.decodeUnknownSync(
  Schema.parseJson(GoogleDiscoveryStoredSourceData),
);

export interface GoogleDiscoverySourceMeta {
  readonly namespace: string;
  readonly name: string;
}

export interface GoogleDiscoveryBindingStore {
  readonly get: (
    toolId: ToolId,
  ) => Effect.Effect<{
    namespace: string;
    binding: GoogleDiscoveryMethodBinding;
  } | null>;

  readonly put: (
    toolId: ToolId,
    namespace: string,
    binding: GoogleDiscoveryMethodBinding,
  ) => Effect.Effect<void>;

  readonly listByNamespace: (
    namespace: string,
  ) => Effect.Effect<readonly ToolId[]>;

  readonly removeByNamespace: (
    namespace: string,
  ) => Effect.Effect<readonly ToolId[]>;

  readonly putSourceMeta: (meta: GoogleDiscoverySourceMeta) => Effect.Effect<void>;
  readonly removeSourceMeta: (namespace: string) => Effect.Effect<void>;
  readonly listSourceMeta: () => Effect.Effect<readonly GoogleDiscoverySourceMeta[]>;

  readonly putSourceData: (
    namespace: string,
    data: GoogleDiscoveryStoredSourceData,
  ) => Effect.Effect<void>;
  readonly getSourceData: (
    namespace: string,
  ) => Effect.Effect<GoogleDiscoveryStoredSourceData | null>;
  readonly removeSourceData: (namespace: string) => Effect.Effect<void>;
}

const makeStore = (
  bindings: ScopedKv,
  meta: ScopedKv,
  config: ScopedKv,
): GoogleDiscoveryBindingStore => ({
  get: (toolId) =>
    Effect.gen(function* () {
      const raw = yield* bindings.get(toolId);
      if (!raw) return null;
      const entry = decodeBindingEntry(raw);
      return {
        namespace: entry.namespace,
        binding: entry.binding,
      };
    }),

  put: (toolId, namespace, binding) =>
    bindings.set(
      toolId,
      encodeBindingEntry({ namespace, binding }),
    ),

  listByNamespace: (namespace) =>
    Effect.gen(function* () {
      const entries = yield* bindings.list();
      const ids: ToolId[] = [];
      for (const entry of entries) {
        const decoded = decodeBindingEntry(entry.value);
        if (decoded.namespace === namespace) {
          ids.push(entry.key as ToolId);
        }
      }
      return ids;
    }),

  removeByNamespace: (namespace) =>
    Effect.gen(function* () {
      const entries = yield* bindings.list();
      const ids: ToolId[] = [];
      for (const entry of entries) {
        const decoded = decodeBindingEntry(entry.value);
        if (decoded.namespace === namespace) {
          ids.push(entry.key as ToolId);
          yield* bindings.delete(entry.key);
        }
      }
      return ids;
    }),

  putSourceMeta: (sourceMeta) =>
    meta.set(sourceMeta.namespace, JSON.stringify(sourceMeta)),

  removeSourceMeta: (namespace) =>
    meta.delete(namespace).pipe(Effect.asVoid),

  listSourceMeta: () =>
    Effect.gen(function* () {
      const entries = yield* meta.list();
      return entries.map((entry) => JSON.parse(entry.value) as GoogleDiscoverySourceMeta);
    }),

  putSourceData: (namespace, data) =>
    config.set(namespace, encodeSourceData(data)),

  getSourceData: (namespace) =>
    Effect.gen(function* () {
      const raw = yield* config.get(namespace);
      return raw ? decodeSourceData(raw) : null;
    }),

  removeSourceData: (namespace) =>
    config.delete(namespace).pipe(Effect.asVoid),
});

export const makeKvBindingStore = (
  kv: Kv,
  namespace: string,
): GoogleDiscoveryBindingStore =>
  makeStore(
    scopeKv(kv, `${namespace}.bindings`),
    scopeKv(kv, `${namespace}.sources`),
    scopeKv(kv, `${namespace}.config`),
  );

export const makeInMemoryBindingStore = (): GoogleDiscoveryBindingStore =>
  makeStore(
    makeInMemoryScopedKv(),
    makeInMemoryScopedKv(),
    makeInMemoryScopedKv(),
  );
