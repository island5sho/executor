import {
  HttpApiBuilder,
  HttpApiSwagger,
  HttpMiddleware,
  HttpServer,
} from "@effect/platform";
import { Layer } from "effect";

import { ExecutorApi } from "@executor/api";
import { ToolsHandlers } from "./handlers/tools";
import { SecretsHandlers } from "./handlers/secrets";
import { ExecutorServiceLive } from "./services/executor";

// ---------------------------------------------------------------------------
// API layer — wire handlers
// ---------------------------------------------------------------------------

const ApiLive = HttpApiBuilder.api(ExecutorApi).pipe(
  Layer.provide([ToolsHandlers, SecretsHandlers]),
  Layer.provide(ExecutorServiceLive),
);

// ---------------------------------------------------------------------------
// Web handler — usable by Vite plugin, standalone server, tests, etc.
// ---------------------------------------------------------------------------

export const createApiHandler = () =>
  HttpApiBuilder.toWebHandler(
    HttpApiSwagger.layer().pipe(
      Layer.provideMerge(HttpApiBuilder.middlewareOpenApi()),
      Layer.provideMerge(HttpApiBuilder.middlewareCors()),
      Layer.provideMerge(ApiLive),
      Layer.provideMerge(HttpServer.layerContext),
    ),
    { middleware: HttpMiddleware.logger },
  );

export type ApiHandler = ReturnType<typeof createApiHandler>;

export { ExecutorServiceLive } from "./services/executor";
