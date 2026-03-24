import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "@effect/platform";
import {
  ControlPlaneBadRequestError,
  ControlPlaneForbiddenError,
  ControlPlaneStorageError,
  type ExecutorHttpApiExtension,
  type ExecutorHttpPlugin,
} from "@executor/platform-api";
import { resolveRequestedLocalWorkspace } from "@executor/platform-api/local-context";
import {
  ScopeIdSchema,
  SourceSchema,
  type Source,
} from "@executor/platform-sdk/schema";
import * as Effect from "effect/Effect";

import {
  OpenApiConnectInputSchema,
  OpenApiPreviewRequestSchema,
  OpenApiPreviewResponseSchema,
  type OpenApiConnectInput,
  type OpenApiPreviewRequest,
  type OpenApiPreviewResponse,
} from "@executor/plugin-openapi-shared";

type OpenApiExecutorExtension = {
  openapi: {
    previewDocument: (
      input: OpenApiPreviewRequest,
    ) => Effect.Effect<OpenApiPreviewResponse, Error, never>;
    createSource: (
      input: OpenApiConnectInput,
    ) => Effect.Effect<Source, Error, never>;
  };
};

const workspaceIdParam = HttpApiSchema.param("workspaceId", ScopeIdSchema);

export const OpenApiHttpGroup = HttpApiGroup.make("openapi")
  .add(
    HttpApiEndpoint.post("previewDocument")`/workspaces/${workspaceIdParam}/plugins/openapi/preview`
      .setPayload(OpenApiPreviewRequestSchema)
      .addSuccess(OpenApiPreviewResponseSchema)
      .addError(ControlPlaneBadRequestError)
      .addError(ControlPlaneForbiddenError)
      .addError(ControlPlaneStorageError),
  )
  .add(
    HttpApiEndpoint.post("createSource")`/workspaces/${workspaceIdParam}/plugins/openapi/sources`
      .setPayload(OpenApiConnectInputSchema)
      .addSuccess(SourceSchema)
      .addError(ControlPlaneBadRequestError)
      .addError(ControlPlaneForbiddenError)
      .addError(ControlPlaneStorageError),
  )
  .prefix("/v1");

export const OpenApiHttpApi = HttpApi.make("executor").add(OpenApiHttpGroup);

export const openApiHttpApiExtension = {
  key: "openapi",
  group: OpenApiHttpGroup,
} satisfies ExecutorHttpApiExtension<typeof OpenApiHttpGroup>;

const toBadRequestError = (operation: string) => (cause: unknown) =>
  new ControlPlaneBadRequestError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    details: cause instanceof Error ? cause.stack ?? cause.message : String(cause),
  });

const toStorageError = (operation: string) => (cause: unknown) =>
  new ControlPlaneStorageError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    details: cause instanceof Error ? cause.stack ?? cause.message : String(cause),
  });

export const openApiHttpPlugin = (): ExecutorHttpPlugin<
  typeof OpenApiHttpGroup,
  OpenApiExecutorExtension
> => ({
  key: "openapi",
  group: OpenApiHttpGroup,
  build: ({ executor }) =>
    HttpApiBuilder.group(OpenApiHttpApi, "openapi", (handlers) =>
      handlers
        .handle("previewDocument", ({ path, payload }) =>
          resolveRequestedLocalWorkspace(
            "openapi.previewDocument",
            path.workspaceId,
          ).pipe(
            Effect.flatMap(() => executor.openapi.previewDocument(payload)),
            Effect.mapError(toBadRequestError("openapi.previewDocument")),
          )
        )
        .handle("createSource", ({ path, payload }) =>
          resolveRequestedLocalWorkspace(
            "openapi.createSource",
            path.workspaceId,
          ).pipe(
            Effect.flatMap(() => executor.openapi.createSource(payload)),
            Effect.mapError(toStorageError("openapi.createSource")),
          )
        )
    ),
});
