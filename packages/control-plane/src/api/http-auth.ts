import { HttpServerRequest } from "@effect/platform";
import type { WorkspaceId } from "#schema";
import {
  Actor,
  ActorForbiddenError,
  type ActorShape,
  ActorUnauthenticatedError,
} from "#domain";
import * as Effect from "effect/Effect";

import { ControlPlaneActorResolver } from "./auth/actor-resolver";
import {
  ControlPlaneForbiddenError,
  ControlPlaneUnauthorizedError,
} from "./errors";

const requestHeaders = Effect.map(
  HttpServerRequest.HttpServerRequest,
  (request) => request.headers,
);

const readString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const toForbiddenError = (
  operation: string,
  cause: unknown,
): ControlPlaneForbiddenError =>
  new ControlPlaneForbiddenError({
    operation,
    message: "Access denied",
    details: `${readString((cause as { permission?: unknown })?.permission, "unknown")} on ${readString((cause as { scope?: unknown })?.scope, "unknown")}`,
  });

const toUnauthorizedError = (
  operation: string,
  cause: unknown,
): ControlPlaneUnauthorizedError =>
  new ControlPlaneUnauthorizedError({
    operation,
    message: readString((cause as { message?: unknown })?.message, "Authentication required"),
    details: "Authentication required",
  });

export const resolveRequestActor = Effect.flatMap(
  ControlPlaneActorResolver,
  (actorResolver) =>
    Effect.flatMap(requestHeaders, (headers) => actorResolver.resolveActor({ headers })),
);

export const resolveWorkspaceRequestActor = (workspaceId: WorkspaceId) =>
  Effect.flatMap(ControlPlaneActorResolver, (actorResolver) =>
    Effect.flatMap(requestHeaders, (headers) =>
      actorResolver.resolveWorkspaceActor({ workspaceId, headers })
    ));

const provideActor = <A, E, R>(
  actor: ActorShape,
  effect: Effect.Effect<A, E, R>,
) => effect.pipe(Effect.provideService(Actor, actor));

export const mapActorHttpErrors = <A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E | ActorUnauthenticatedError | ActorForbiddenError, R>,
): Effect.Effect<A, E | ControlPlaneUnauthorizedError | ControlPlaneForbiddenError, R> =>
  effect.pipe(
    Effect.catchTag("ActorUnauthenticatedError", (cause) =>
      Effect.fail(toUnauthorizedError(operation, cause)),
    ),
    Effect.catchTag("ActorForbiddenError", (cause) =>
      Effect.fail(toForbiddenError(operation, cause)),
    ),
  );

export const withRequestActor = <A, E, R>(
  operation: string,
  run: (actor: ActorShape) => Effect.Effect<A, E | ActorForbiddenError, R | Actor>,
) =>
  mapActorHttpErrors(
    operation,
    Effect.gen(function* () {
      const actor = yield* resolveRequestActor;
      return yield* provideActor(actor, run(actor));
    }),
  );

export const withWorkspaceRequestActor = <A, E, R>(
  operation: string,
  workspaceId: WorkspaceId,
  run: (actor: ActorShape) => Effect.Effect<A, E | ActorForbiddenError, R | Actor>,
) =>
  mapActorHttpErrors(
    operation,
    Effect.gen(function* () {
      const actor = yield* resolveWorkspaceRequestActor(workspaceId);
      return yield* provideActor(actor, run(actor));
    }),
  );
