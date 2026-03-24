import {
  Atom,
  AtomHttpApi,
  RegistryContext,
  RegistryProvider,
  Result,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react";
import {
  FetchHttpClient,
} from "@effect/platform";
import type * as HttpApi from "@effect/platform/HttpApi";
import type * as HttpApiGroup from "@effect/platform/HttpApiGroup";
import {
  ExecutorApi,
  createExecutorApi,
  type CreateSecretPayload,
  type CreateSecretResult,
  type DeleteSecretResult,
  type ExecutorHttpApiExtension,
  type InstanceConfig,
  type LocalInstallation,
  type SecretListItem,
  type UpdateSecretPayload,
  type UpdateSecretResult,
} from "@executor/platform-api";
import type {
  Source,
  SourceInspection,
  SourceInspectionDiscoverResult,
  SourceInspectionToolDetail,
} from "@executor/platform-sdk/schema";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as React from "react";

const DEFAULT_EXECUTOR_API_BASE_URL = "http://127.0.0.1:8788";
const PLACEHOLDER_WORKSPACE_ID = "ws_placeholder" as Source["scopeId"];

type ReactivityKeys = Readonly<Record<string, ReadonlyArray<unknown>>>;

type SecretMutationState<T> = {
  status: "idle" | "pending" | "success" | "error";
  data: T | null;
  error: Error | null;
};

export type SourceRemoveResult = {
  removed: boolean;
};

export type Loadable<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; data: T };

type WorkspaceContext = {
  installation: LocalInstallation;
  workspaceId: Source["scopeId"];
};

let apiBaseUrl =
  typeof window !== "undefined" && typeof window.location?.origin === "string"
    ? window.location.origin
    : DEFAULT_EXECUTOR_API_BASE_URL;

const pendingResultAtom = Atom.make(
  Effect.never as Effect.Effect<never, Error>,
).pipe(Atom.keepAlive);

const causeMessage = (cause: Cause.Cause<unknown>): Error =>
  new Error(Cause.pretty(cause));

const toLoadable = <T>(result: Result.Result<T, unknown>): Loadable<T> => {
  if (Result.isSuccess(result)) {
    return {
      status: "ready",
      data: result.value,
    };
  }

  if (Result.isFailure(result)) {
    return {
      status: "error",
      error: causeMessage(result.cause),
    };
  }

  return {
    status: "loading",
  };
};

const pendingLoadable = <T>(workspace: Loadable<WorkspaceContext>): Loadable<T> => {
  if (workspace.status === "loading") {
    return { status: "loading" };
  }

  if (workspace.status === "error") {
    return { status: "error", error: workspace.error };
  }

  throw new Error("Expected workspace loadable to be pending or errored");
};

const useLoadableAtom = <T>(atom: Atom.Atom<Result.Result<T, unknown>>): Loadable<T> => {
  const result = useAtomValue(atom);
  return React.useMemo(() => toLoadable(result), [result]);
};

const disabledAtom = <T>() =>
  pendingResultAtom as unknown as Atom.Atom<Result.Result<T, unknown>>;

export const getExecutorApiBaseUrl = (): string => apiBaseUrl;

export const setExecutorApiBaseUrl = (baseUrl: string): void => {
  apiBaseUrl = baseUrl;
};

export const defineExecutorHttpApiClient =
  <Self>() =>
  <
    const Id extends string,
    ApiId extends string,
    Groups extends HttpApiGroup.HttpApiGroup.Any,
    ApiE,
    R,
  >(
    id: Id,
    api: HttpApi.HttpApi<ApiId, Groups, ApiE, R>,
  ) => {
    const build = (baseUrl: string | URL) =>
      AtomHttpApi.Tag<Self>()(id, {
        api,
        httpClient: FetchHttpClient.layer as any,
        baseUrl,
      });

    const cache = new Map<string, ReturnType<typeof build>>();

    return (baseUrl: string | URL = getExecutorApiBaseUrl()) => {
      const key = String(baseUrl);
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const client = build(baseUrl);
      cache.set(key, client);
      return client;
    };
  };

export const defineExecutorPluginHttpApiClient =
  <Self>() =>
  <
    const Id extends string,
    TExtensions extends readonly ExecutorHttpApiExtension[],
  >(
    id: Id,
    extensions: TExtensions,
  ) =>
    defineExecutorHttpApiClient<Self>()(
      id,
      createExecutorApi({
        plugins: extensions,
      }),
    );

const getExecutorApiHttpClient = defineExecutorHttpApiClient<"ExecutorReactHttpClient">()(
  "ExecutorReactHttpClient",
  ExecutorApi,
);

const localInstallationReactivityKey = (): ReactivityKeys => ({
  localInstallation: [],
});

const instanceConfigReactivityKey = (): ReactivityKeys => ({
  instanceConfig: [],
});

const secretsReactivityKey = (): ReactivityKeys => ({
  secrets: [],
});

const sourcesReactivityKey = (workspaceId: Source["scopeId"]): ReactivityKeys => ({
  sources: [workspaceId],
});

const sourceReactivityKey = (
  workspaceId: Source["scopeId"],
  sourceId: Source["id"],
): ReactivityKeys => ({
  source: [workspaceId, sourceId],
});

const sourceInspectionReactivityKey = (
  workspaceId: Source["scopeId"],
  sourceId: Source["id"],
): ReactivityKeys => ({
  sourceInspection: [workspaceId, sourceId],
});

const sourceInspectionToolReactivityKey = (
  workspaceId: Source["scopeId"],
  sourceId: Source["id"],
  toolPath?: string | null,
): ReactivityKeys => ({
  sourceInspectionTool:
    toolPath === undefined || toolPath === null
      ? [workspaceId, sourceId]
      : [workspaceId, sourceId, toolPath],
});

const sourceDiscoveryReactivityKey = (
  workspaceId: Source["scopeId"],
  sourceId: Source["id"],
  query?: string,
  limit?: number | null,
): ReactivityKeys => ({
  sourceDiscovery:
    query === undefined
      ? [workspaceId, sourceId]
      : [workspaceId, sourceId, query, limit ?? null],
});

const localInstallationAtom = (baseUrl: string) =>
  getExecutorApiHttpClient(baseUrl).query("local", "installation", {
    reactivityKeys: localInstallationReactivityKey(),
    timeToLive: "5 minutes",
  });

const instanceConfigAtom = (baseUrl: string) =>
  getExecutorApiHttpClient(baseUrl).query("local", "config", {
    reactivityKeys: instanceConfigReactivityKey(),
    timeToLive: "5 minutes",
  });

const secretsAtom = (baseUrl: string) =>
  getExecutorApiHttpClient(baseUrl).query("local", "listSecrets", {
    reactivityKeys: secretsReactivityKey(),
    timeToLive: "1 minute",
  });

const sourcesAtom = (workspaceId: Source["scopeId"]) =>
  getExecutorApiHttpClient().query("sources", "list", {
    path: {
      workspaceId,
    },
    reactivityKeys: sourcesReactivityKey(workspaceId),
    timeToLive: "30 seconds",
  });

const sourceAtom = (
  workspaceId: Source["scopeId"],
  sourceId: Source["id"],
) =>
  getExecutorApiHttpClient().query("sources", "get", {
    path: {
      workspaceId,
      sourceId,
    },
    reactivityKeys: sourceReactivityKey(workspaceId, sourceId),
    timeToLive: "30 seconds",
  });

const sourceInspectionAtom = (
  workspaceId: Source["scopeId"],
  sourceId: Source["id"],
) =>
  getExecutorApiHttpClient().query("sources", "inspection", {
    path: {
      workspaceId,
      sourceId,
    },
    reactivityKeys: sourceInspectionReactivityKey(workspaceId, sourceId),
    timeToLive: "30 seconds",
  });

const sourceInspectionToolAtom = (
  workspaceId: Source["scopeId"],
  sourceId: Source["id"],
  toolPath: string | null,
) =>
  toolPath === null
    ? disabledAtom<SourceInspectionToolDetail | null>()
    : getExecutorApiHttpClient().query("sources", "inspectionTool", {
        path: {
          workspaceId,
          sourceId,
          toolPath,
        },
        reactivityKeys: sourceInspectionToolReactivityKey(
          workspaceId,
          sourceId,
          toolPath,
        ),
        timeToLive: "30 seconds",
      });

const emptyDiscoveryResult: SourceInspectionDiscoverResult = {
  query: "",
  queryTokens: [],
  bestPath: null,
  total: 0,
  results: [],
};

const sourceDiscoveryAtom = (
  workspaceId: Source["scopeId"],
  sourceId: Source["id"],
  query: string,
  limit: number | null,
) =>
  query.trim().length === 0
    ? Atom.make(
        Effect.succeed(emptyDiscoveryResult),
      ).pipe(Atom.keepAlive)
    : getExecutorApiHttpClient().query("sources", "inspectionDiscover", {
        path: {
          workspaceId,
          sourceId,
        },
        payload: {
          query,
          ...(limit !== null ? { limit } : {}),
        },
        reactivityKeys: sourceDiscoveryReactivityKey(
          workspaceId,
          sourceId,
          query,
          limit,
        ),
        timeToLive: "15 seconds",
      });

const useWorkspaceContext = (): Loadable<WorkspaceContext> => {
  const installation = useLoadableAtom(localInstallationAtom(getExecutorApiBaseUrl()));

  return React.useMemo(() => {
    if (installation.status !== "ready") {
      return installation;
    }

    return {
      status: "ready",
      data: {
        installation: installation.data,
        workspaceId: installation.data.scopeId,
      },
    } satisfies Loadable<WorkspaceContext>;
  }, [installation]);
};

const useWorkspaceRequestContext = () => {
  const workspace = useWorkspaceContext();
  const enabled = workspace.status === "ready";

  return React.useMemo(
    () => ({
      workspace,
      enabled,
      workspaceId: enabled
        ? workspace.data.workspaceId
        : PLACEHOLDER_WORKSPACE_ID,
    }),
    [enabled, workspace],
  );
};

export const useExecutorMutation = <TInput, TOutput>(
  execute: (input: TInput) => Promise<TOutput>,
) => {
  const [state, setState] = React.useState<SecretMutationState<TOutput>>({
    status: "idle",
    data: null,
    error: null,
  });

  const mutateAsync = React.useCallback(async (payload: TInput) => {
    setState((current) => ({
      status: "pending",
      data: current.data,
      error: null,
    }));

    try {
      const data = await execute(payload);
      setState({ status: "success", data, error: null });
      return data;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setState({ status: "error", data: null, error });
      throw error;
    }
  }, [execute]);

  const reset = React.useCallback(() => {
    setState({ status: "idle", data: null, error: null });
  }, []);

  return React.useMemo(
    () => ({
      ...state,
      mutateAsync,
      reset,
    }),
    [mutateAsync, reset, state],
  );
};

export const ExecutorReactProvider = (props: React.PropsWithChildren) =>
  React.createElement(RegistryProvider, null, props.children);

export const useLocalInstallation = (): Loadable<LocalInstallation> =>
  useLoadableAtom(localInstallationAtom(getExecutorApiBaseUrl()));

export const useInstanceConfig = (): Loadable<InstanceConfig> =>
  useLoadableAtom(instanceConfigAtom(getExecutorApiBaseUrl()));

export const useSecrets = (): Loadable<ReadonlyArray<SecretListItem>> =>
  useLoadableAtom(secretsAtom(getExecutorApiBaseUrl()));

export const useRefreshSecrets = (): (() => void) =>
  useAtomRefresh(secretsAtom(getExecutorApiBaseUrl()));

export const useCreateSecret = () => {
  const mutate = useAtomSet(
    getExecutorApiHttpClient().mutation("local", "createSecret"),
    { mode: "promise" },
  );

  return useExecutorMutation<CreateSecretPayload, CreateSecretResult>(
    React.useCallback(
      (payload) =>
        mutate({
          payload,
          reactivityKeys: secretsReactivityKey(),
        }),
      [mutate],
    ),
  );
};

export const useUpdateSecret = () => {
  const mutate = useAtomSet(
    getExecutorApiHttpClient().mutation("local", "updateSecret"),
    { mode: "promise" },
  );

  return useExecutorMutation<
    { secretId: string; payload: UpdateSecretPayload },
    UpdateSecretResult
  >(
    React.useCallback(
      (input) =>
        mutate({
          path: { secretId: input.secretId },
          payload: input.payload,
          reactivityKeys: secretsReactivityKey(),
        }),
      [mutate],
    ),
  );
};

export const useDeleteSecret = () => {
  const mutate = useAtomSet(
    getExecutorApiHttpClient().mutation("local", "deleteSecret"),
    { mode: "promise" },
  );

  return useExecutorMutation<string, DeleteSecretResult>(
    React.useCallback(
      (secretId) =>
        mutate({
          path: { secretId },
          reactivityKeys: secretsReactivityKey(),
        }),
      [mutate],
    ),
  );
};

export const useSources = (): Loadable<ReadonlyArray<Source>> => {
  const workspace = useWorkspaceRequestContext();
  const atom = workspace.enabled
    ? sourcesAtom(workspace.workspaceId)
    : disabledAtom<ReadonlyArray<Source>>();
  const sources = useLoadableAtom(atom);

  return workspace.enabled ? sources : pendingLoadable(workspace.workspace);
};

export const useSource = (sourceId: string): Loadable<Source> => {
  const workspace = useWorkspaceRequestContext();
  const atom = workspace.enabled
    ? sourceAtom(workspace.workspaceId, sourceId as Source["id"])
    : disabledAtom<Source>();
  const source = useLoadableAtom(atom);

  return workspace.enabled ? source : pendingLoadable(workspace.workspace);
};

export const useSourceInspection = (sourceId: string): Loadable<SourceInspection> => {
  const workspace = useWorkspaceRequestContext();
  const atom = workspace.enabled
    ? sourceInspectionAtom(workspace.workspaceId, sourceId as Source["id"])
    : disabledAtom<SourceInspection>();
  const inspection = useLoadableAtom(atom);

  return workspace.enabled ? inspection : pendingLoadable(workspace.workspace);
};

export const useSourceToolDetail = (
  sourceId: string,
  toolPath: string | null,
): Loadable<SourceInspectionToolDetail | null> => {
  const workspace = useWorkspaceRequestContext();
  const atom = workspace.enabled
    ? sourceInspectionToolAtom(
        workspace.workspaceId,
        sourceId as Source["id"],
        toolPath,
      )
    : disabledAtom<SourceInspectionToolDetail | null>();
  const detail = useLoadableAtom(atom);

  return workspace.enabled ? detail : pendingLoadable(workspace.workspace);
};

export const useSourceDiscovery = (input: {
  sourceId: string;
  query: string;
  limit?: number;
}): Loadable<SourceInspectionDiscoverResult> => {
  const workspace = useWorkspaceRequestContext();
  const atom = workspace.enabled
    ? sourceDiscoveryAtom(
        workspace.workspaceId,
        input.sourceId as Source["id"],
        input.query,
        input.limit ?? null,
      )
    : disabledAtom<SourceInspectionDiscoverResult>();
  const results = useLoadableAtom(atom);

  return workspace.enabled ? results : pendingLoadable(workspace.workspace);
};

export const usePrefetchToolDetail = () => {
  const registry = React.useContext(RegistryContext);
  const workspace = useWorkspaceRequestContext();

  return React.useCallback(
    (sourceId: string, toolPath: string): (() => void) => {
      if (!workspace.enabled) {
        return () => {};
      }

      return registry.mount(
        sourceInspectionToolAtom(
          workspace.workspaceId,
          sourceId as Source["id"],
          toolPath,
        ),
      );
    },
    [registry, workspace.enabled, workspace.workspaceId],
  );
};

export const useRemoveSource = () => {
  const workspace = useWorkspaceRequestContext();
  const mutate = useAtomSet(
    getExecutorApiHttpClient().mutation("sources", "remove"),
    { mode: "promise" },
  );

  return useExecutorMutation<Source["id"], SourceRemoveResult>(
    React.useCallback(
      (sourceId) => {
        if (!workspace.enabled) {
          return Promise.reject(
            new Error("Executor workspace context is not ready"),
          );
        }

        return mutate({
          path: {
            workspaceId: workspace.workspaceId,
            sourceId,
          },
          reactivityKeys: {
            ...sourcesReactivityKey(workspace.workspaceId),
            ...sourceReactivityKey(workspace.workspaceId, sourceId),
            ...sourceInspectionReactivityKey(workspace.workspaceId, sourceId),
            ...sourceInspectionToolReactivityKey(workspace.workspaceId, sourceId),
            ...sourceDiscoveryReactivityKey(workspace.workspaceId, sourceId),
          },
        });
      },
      [mutate, workspace.enabled, workspace.workspaceId],
    ),
  );
};

export {
  Atom,
  AtomHttpApi,
  RegistryContext,
  RegistryProvider,
  Result,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
};

export type {
  CreateSecretPayload,
  CreateSecretResult,
  DeleteSecretResult,
  InstanceConfig,
  LocalInstallation,
  SecretListItem,
  Source,
  SourceInspection,
  SourceInspectionDiscoverResult,
  SourceInspectionToolDetail,
  UpdateSecretPayload,
  UpdateSecretResult,
};
