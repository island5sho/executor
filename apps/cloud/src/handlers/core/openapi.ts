import { Effect, Layer } from "effect";
import {
  OpenApiHandlers,
  OpenApiExtensionService,
} from "@executor/plugin-openapi/api";
import { ExecutorService } from "../../services/executor";

const OpenApiExtensionLive = Layer.effect(
  OpenApiExtensionService,
  Effect.map(ExecutorService, (executor) => executor.openapi),
);

export const OpenApiHandlersLive = Layer.provide(
  OpenApiHandlers,
  OpenApiExtensionLive,
);
