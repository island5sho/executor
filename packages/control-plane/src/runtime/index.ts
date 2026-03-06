import * as Effect from "effect/Effect";

import {
  type ControlPlaneActorResolverShape,
  type ControlPlaneServiceShape,
} from "#api";
import {
  makeSqlControlPlanePersistence,
  SqlPersistenceBootstrapError,
  type CreateSqlRuntimeOptions,
  type SqlControlPlanePersistence,
} from "#persistence";

import {
  ControlPlaneAuthHeaders,
  makeHeaderActorResolver,
} from "./actor-resolver";
import type { LocalInstallation } from "#schema";
import {
  getOrProvisionLocalInstallation,
} from "./local-installation";
import {
  type ResolveExecutionEnvironment,
} from "./execution-state";
import {
  makeLiveExecutionManager,
} from "./live-execution";
import { makeRuntimeControlPlaneService } from "./services";

export {
  ControlPlaneAuthHeaders,
  makeHeaderActorResolver,
  makeRuntimeControlPlaneService,
};

export * from "./execution-state";
export * from "./live-execution";
export * from "./local-installation";

export type RuntimeControlPlaneInput = {
  persistence: SqlControlPlanePersistence;
  actorResolver?: ControlPlaneActorResolverShape;
  executionResolver?: ResolveExecutionEnvironment;
};

export const makeRuntimeControlPlane = (
  input: RuntimeControlPlaneInput,
): {
  service: ControlPlaneServiceShape;
  actorResolver: ControlPlaneActorResolverShape;
} => {
  const liveExecutionManager = makeLiveExecutionManager();
  const service = makeRuntimeControlPlaneService(input.persistence.rows, {
    executionResolver: input.executionResolver,
    liveExecutionManager,
  });
  const actorResolver = input.actorResolver ?? makeHeaderActorResolver(input.persistence.rows);

  return {
    service,
    actorResolver,
  };
};

export type SqlControlPlaneRuntime = {
  persistence: SqlControlPlanePersistence;
  localInstallation: LocalInstallation;
  service: ControlPlaneServiceShape;
  actorResolver: ControlPlaneActorResolverShape;
  close: () => Promise<void>;
};

export type CreateSqlControlPlaneRuntimeOptions = CreateSqlRuntimeOptions & {
  actorResolver?: ControlPlaneActorResolverShape;
  executionResolver?: ResolveExecutionEnvironment;
};

export const makeSqlControlPlaneRuntime = (
  options: CreateSqlControlPlaneRuntimeOptions,
): Effect.Effect<SqlControlPlaneRuntime, SqlPersistenceBootstrapError> =>
  Effect.flatMap(makeSqlControlPlanePersistence(options), (persistence) =>
    Effect.gen(function* () {
      const runtime = makeRuntimeControlPlane({
        persistence,
        actorResolver: options.actorResolver,
        executionResolver: options.executionResolver,
      });
      const localInstallation = yield* getOrProvisionLocalInstallation(persistence.rows).pipe(
        Effect.mapError((cause) =>
          new SqlPersistenceBootstrapError({
            message: `Failed provisioning local installation: ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
            details: cause instanceof Error ? cause.message : String(cause),
          }),
        ),
      );

      return {
        persistence,
        localInstallation,
        service: runtime.service,
        actorResolver: runtime.actorResolver,
        close: () => persistence.close(),
      };
    })
  );
