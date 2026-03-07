import { ControlPlanePersistenceError } from "#persistence";
import * as Effect from "effect/Effect";

import { loadLocalInstallation } from "./local-installation";
import {
  operationErrors,
} from "./operation-errors";
import { RuntimeSourceAuthServiceTag } from "./source-auth-service";
import { ControlPlaneStore } from "./store";

const localOps = {
  installation: operationErrors("local.installation.get"),
  oauthCallback: operationErrors("local.oauth.callback"),
} as const;

export const getLocalInstallation = () =>
  Effect.gen(function* () {
    const store = yield* ControlPlaneStore;

    const installation = yield* loadLocalInstallation(store).pipe(
      Effect.mapError((error) =>
        error instanceof ControlPlanePersistenceError
          ? localOps.installation.storage(error)
          : localOps.installation.unknownStorage(
              error,
              "Failed loading local installation",
            ),
      ),
    );

    if (installation === null) {
      return yield* Effect.fail(
        localOps.installation.notFound(
          "Local installation not found",
          "No local installation has been provisioned",
        ),
      );
    }

    return installation;
  });

export const completeSourceAuthCallback = (input: {
  state: string;
  code?: string | null;
  error?: string | null;
  errorDescription?: string | null;
}) =>
  Effect.gen(function* () {
    const sourceAuthService = yield* RuntimeSourceAuthServiceTag;

    return yield* sourceAuthService.completeSourceAuthCallback(input).pipe(
      Effect.mapError((error) =>
        localOps.oauthCallback.unknownStorage(
          error,
          "Failed completing source auth callback",
        ),
      ),
    );
  });
