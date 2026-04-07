import { Effect, Layer } from "effect";
import {
  GraphqlHandlers,
  GraphqlExtensionService,
} from "@executor/plugin-graphql/api";
import { ExecutorService } from "../../services/executor";

const GraphqlExtensionLive = Layer.effect(
  GraphqlExtensionService,
  Effect.map(ExecutorService, (executor) => executor.graphql),
);

export const GraphqlHandlersLive = Layer.provide(
  GraphqlHandlers,
  GraphqlExtensionLive,
);
