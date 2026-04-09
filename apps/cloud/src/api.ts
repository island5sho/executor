// ---------------------------------------------------------------------------
// Cloud API — three layers: public, session-authenticated, org-authenticated
// ---------------------------------------------------------------------------

import { env } from "cloudflare:workers";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiSwagger,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
} from "@effect/platform";
import { Effect, Layer } from "effect";

import { CoreExecutorApi } from "@executor/api";
import { CoreHandlers, ExecutorService, ExecutionEngineService } from "@executor/api/server";
import { createExecutionEngine } from "@executor/execution";
import { makeDynamicWorkerExecutor, type CodeExecutor } from "@executor/runtime-dynamic-worker";
import { OpenApiGroup, OpenApiExtensionService, OpenApiHandlers } from "@executor/plugin-openapi/api";
import { McpGroup, McpExtensionService, McpHandlers } from "@executor/plugin-mcp/api";
import {
  GoogleDiscoveryGroup,
  GoogleDiscoveryExtensionService,
  GoogleDiscoveryHandlers,
} from "@executor/plugin-google-discovery/api";
import { GraphqlGroup, GraphqlExtensionService, GraphqlHandlers } from "@executor/plugin-graphql/api";

import { CloudAuthApi, CloudAuthPublicApi } from "./auth/api";
import { OrgAuth, OrgAuthLive, SessionAuthLive } from "./auth/middleware";
import { UserStoreService } from "./auth/context";
import {
  CloudAuthPublicHandlers,
  CloudSessionAuthHandlers,
} from "./auth/handlers";
import { WorkOSAuth } from "./auth/workos";
import { DbService } from "./services/db";
import { createOrgExecutor } from "./services/executor";
import { server } from "./env";

// ---------------------------------------------------------------------------
// API definitions
// ---------------------------------------------------------------------------

/** Protected (org-required) API — all the executor groups + OrgAuth middleware */
const ProtectedCloudApi = CoreExecutorApi
  .add(OpenApiGroup)
  .add(McpGroup)
  .add(GoogleDiscoveryGroup)
  .add(GraphqlGroup)
  .middleware(OrgAuth);

/** Session-only API — just the auth endpoints (SessionAuth on the group) */
const SessionCloudApi = HttpApi.make("cloudSession").add(CloudAuthApi);

/** Public API — login + callback, no auth */
const PublicCloudApi = HttpApi.make("cloudPublic").add(CloudAuthPublicApi);

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

const DbLive = DbService.Live;
const UserStoreLive = UserStoreService.Live.pipe(Layer.provide(DbLive));

const SharedServices = Layer.mergeAll(
  DbLive,
  UserStoreLive,
  WorkOSAuth.Default,
  HttpServer.layerContext,
);

const ProtectedCloudApiLive = HttpApiBuilder.api(ProtectedCloudApi).pipe(
  Layer.provide(
    Layer.mergeAll(
      CoreHandlers,
      OpenApiHandlers,
      McpHandlers,
      GoogleDiscoveryHandlers,
      GraphqlHandlers,
      OrgAuthLive,
    ),
  ),
);

const SessionCloudApiLive = HttpApiBuilder.api(SessionCloudApi).pipe(
  Layer.provide(CloudSessionAuthHandlers),
  Layer.provideMerge(SessionAuthLive),
);

const PublicCloudApiLive = HttpApiBuilder.api(PublicCloudApi).pipe(
  Layer.provide(CloudAuthPublicHandlers),
);

// ---------------------------------------------------------------------------
// Static web handlers — built once at module load
// ---------------------------------------------------------------------------

const RouterConfig = HttpRouter.setRouterConfig({ maxParamLength: 1000 });

const publicHandler = HttpApiBuilder.toWebHandler(
  PublicCloudApiLive.pipe(
    Layer.provideMerge(SharedServices),
    Layer.provideMerge(RouterConfig),
  ),
  { middleware: HttpMiddleware.logger },
);

const sessionHandler = HttpApiBuilder.toWebHandler(
  SessionCloudApiLive.pipe(
    Layer.provideMerge(SharedServices),
    Layer.provideMerge(RouterConfig),
  ),
  { middleware: HttpMiddleware.logger },
);

// ---------------------------------------------------------------------------
// Protected handler — must be built per-request because the executor varies
// ---------------------------------------------------------------------------

const buildProtectedHandler = (
  organizationId: string,
  organizationName: string,
  codeExecutor: CodeExecutor,
) =>
  Effect.gen(function* () {
    const executor = yield* createOrgExecutor(
      organizationId,
      organizationName,
      server.ENCRYPTION_KEY,
    );

    const engine = createExecutionEngine({ executor, codeExecutor });

    const requestServices = Layer.mergeAll(
      Layer.succeed(ExecutorService, executor),
      Layer.succeed(ExecutionEngineService, engine),
      Layer.succeed(OpenApiExtensionService, executor.openapi),
      Layer.succeed(McpExtensionService, executor.mcp),
      Layer.succeed(GoogleDiscoveryExtensionService, executor.googleDiscovery),
      Layer.succeed(GraphqlExtensionService, executor.graphql),
    );

    return HttpApiBuilder.toWebHandler(
      HttpApiSwagger.layer({ path: "/docs" }).pipe(
        Layer.provideMerge(HttpApiBuilder.middlewareOpenApi()),
        Layer.provideMerge(ProtectedCloudApiLive),
        Layer.provideMerge(requestServices),
        Layer.provideMerge(SharedServices),
        Layer.provideMerge(HttpRouter.setRouterConfig({ maxParamLength: 1000 })),
      ),
      { middleware: HttpMiddleware.logger },
    );
  });

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const isPublicPath = (pathname: string): boolean =>
  pathname === "/auth/login" || pathname === "/auth/callback";

const isSessionPath = (pathname: string): boolean =>
  pathname === "/auth/me" ||
  pathname === "/auth/logout" ||
  pathname === "/auth/organization";

/**
 * Resolve the user's organization for executor creation. Reads from the
 * session cookie via WorkOS — if there's no org we fall through to the
 * session handler which will reject with NoOrganization for non-session paths.
 */
const lookupOrgForRequest = (request: Request) =>
  Effect.gen(function* () {
    const workos = yield* WorkOSAuth;
    const result = yield* workos.authenticateRequest(request);
    if (!result || !result.organizationId) return null;
    const users = yield* UserStoreService;
    const org = yield* users.use((s) =>
      s.getOrganization(result.organizationId!),
    );
    return org;
  });

export const handleApiRequest = async (request: Request): Promise<Response> => {
  const pathname = new URL(request.url).pathname;

  if (isPublicPath(pathname)) {
    return publicHandler.handler(request);
  }

  if (isSessionPath(pathname)) {
    return sessionHandler.handler(request);
  }

  // Protected path — needs an org-scoped executor
  const program = Effect.gen(function* () {
    const org = yield* lookupOrgForRequest(request);
    if (!org) {
      // No org — let the protected handler reject via OrgAuth middleware
      // (it will return 403 NoOrganization)
      return null;
    }

    const codeExecutor = makeDynamicWorkerExecutor({ loader: env.LOADER });
    const handler = yield* buildProtectedHandler(org.id, org.name, codeExecutor);
    return yield* Effect.promise(() => handler.handler(request));
  });

  const result = await Effect.runPromise(
    program.pipe(
      Effect.provide(SharedServices),
      Effect.scoped,
    ),
  );

  if (result === null) {
    // Fall through to session handler so it returns the proper error
    return sessionHandler.handler(request);
  }
  return result;
};
