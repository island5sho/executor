// ---------------------------------------------------------------------------
// Cloud API — core groups + plugin groups with auth middleware
// ---------------------------------------------------------------------------

import {
  HttpApiBuilder,
  HttpApiSwagger,
  HttpMiddleware,
  HttpServer,
  HttpServerRequest,
} from "@effect/platform";
import { Context, Effect, Layer } from "effect";

import { addGroup } from "@executor/api";
import { createExecutionEngine } from "@executor/execution";
import { OpenApiGroup } from "@executor/plugin-openapi/api";
import { McpGroup } from "@executor/plugin-mcp/api";
import { GoogleDiscoveryGroup } from "@executor/plugin-google-discovery/api";
import { OnePasswordGroup } from "@executor/plugin-onepassword/api";
import { GraphqlGroup } from "@executor/plugin-graphql/api";
import { makeUserStore } from "@executor/storage-postgres";

import { ExecutorService, createTeamExecutor } from "./services/executor";
import { ExecutionEngineService } from "./services/engine";
import { AuthContext } from "./auth/context";
import { parseSessionId, validateSession } from "./auth/session";
import type { DrizzleDb } from "./services/db";

// ---------------------------------------------------------------------------
// Composed API — core + plugin groups (same as apps/server)
// ---------------------------------------------------------------------------

const ExecutorApiWithPlugins = addGroup(OpenApiGroup)
  .add(McpGroup)
  .add(GoogleDiscoveryGroup)
  .add(OnePasswordGroup)
  .add(GraphqlGroup);

// ---------------------------------------------------------------------------
// Handler imports — reuse exact same handlers as apps/server
// These all resolve ExecutorService from context, which we provide per-request
// ---------------------------------------------------------------------------

import { ToolsHandlers } from "./handlers/core/tools";
import { SourcesHandlers } from "./handlers/core/sources";
import { SecretsHandlers } from "./handlers/core/secrets";
import { ExecutionsHandlers } from "./handlers/core/executions";
import { ScopeHandlers } from "./handlers/core/scope";
import { OpenApiHandlersLive } from "./handlers/core/openapi";
import { McpSourceHandlersLive } from "./handlers/core/mcp-source";
import { GoogleDiscoveryHandlersLive } from "./handlers/core/google-discovery";
import { OnePasswordHandlersLive } from "./handlers/core/onepassword";
import { GraphqlHandlersLive } from "./handlers/core/graphql";

// ---------------------------------------------------------------------------
// API Layer
// ---------------------------------------------------------------------------

const ApiBase = HttpApiBuilder.api(ExecutorApiWithPlugins).pipe(
  Layer.provide([
    ToolsHandlers,
    SourcesHandlers,
    SecretsHandlers,
    ExecutionsHandlers,
    ScopeHandlers,
    OpenApiHandlersLive,
    McpSourceHandlersLive,
    GoogleDiscoveryHandlersLive,
    OnePasswordHandlersLive,
    GraphqlHandlersLive,
  ]),
);

// ---------------------------------------------------------------------------
// Create API handler with auth-based executor resolution
// ---------------------------------------------------------------------------

export const createCloudApiHandler = (db: DrizzleDb, encryptionKey: string) => {
  const userStore = makeUserStore(db);

  return async (request: Request): Promise<Response> => {
    // Resolve auth from cookie
    const sessionId = parseSessionId(request.headers.get("cookie"));
    if (!sessionId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await validateSession(userStore, sessionId);
    if (!session) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    const user = await userStore.getUser(session.userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 401 });
    }

    const team = await userStore.getTeam(session.teamId);
    const teamName = team?.name ?? "Unknown Team";

    // Create per-request executor
    const executor = await Effect.runPromise(
      createTeamExecutor(db, session.teamId, teamName, encryptionKey),
    );

    const engine = createExecutionEngine({ executor });

    const handler = HttpApiBuilder.toWebHandler(
      HttpApiSwagger.layer().pipe(
        Layer.provideMerge(HttpApiBuilder.middlewareOpenApi()),
        Layer.provideMerge(ApiBase),
        Layer.provideMerge(Layer.succeed(ExecutorService, executor)),
        Layer.provideMerge(Layer.succeed(ExecutionEngineService, engine)),
        Layer.provideMerge(
          Layer.succeed(AuthContext, {
            userId: session.userId,
            teamId: session.teamId,
            email: user.email,
          }),
        ),
        Layer.provideMerge(HttpServer.layerContext),
      ),
      { middleware: HttpMiddleware.logger },
    );

    try {
      return await handler.handler(request);
    } finally {
      await Effect.runPromise(executor.close()).catch(() => undefined);
      handler.dispose();
    }
  };
};
