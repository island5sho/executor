import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform";
import {
  OrganizationIdSchema,
  OrganizationStatusSchema,
  OrganizationSchema,
} from "#schema";
import * as Schema from "effect/Schema";

import {
  ControlPlaneBadRequestError,
  ControlPlaneForbiddenError,
  ControlPlaneNotFoundError,
  ControlPlaneStorageError,
  ControlPlaneUnauthorizedError,
} from "../errors";
import {
  OptionalTrimmedNonEmptyStringSchema,
  TrimmedNonEmptyStringSchema,
} from "../string-schemas";

export const CreateOrganizationPayloadSchema = Schema.Struct({
  name: TrimmedNonEmptyStringSchema,
  slug: OptionalTrimmedNonEmptyStringSchema,
});

export type CreateOrganizationPayload = typeof CreateOrganizationPayloadSchema.Type;

export const UpdateOrganizationPayloadSchema = Schema.Struct({
  name: OptionalTrimmedNonEmptyStringSchema,
  status: Schema.optional(OrganizationStatusSchema),
});

export type UpdateOrganizationPayload = typeof UpdateOrganizationPayloadSchema.Type;

const organizationIdParam = HttpApiSchema.param("organizationId", OrganizationIdSchema);

export class OrganizationsApi extends HttpApiGroup.make("organizations")
  .add(
    HttpApiEndpoint.get("list")`/organizations`
      .addSuccess(Schema.Array(OrganizationSchema))
      .addError(ControlPlaneBadRequestError)
      .addError(ControlPlaneUnauthorizedError)
      .addError(ControlPlaneForbiddenError)
      .addError(ControlPlaneStorageError),
  )
  .add(
    HttpApiEndpoint.post("create")`/organizations`
      .setPayload(CreateOrganizationPayloadSchema)
      .addSuccess(OrganizationSchema)
      .addError(ControlPlaneBadRequestError)
      .addError(ControlPlaneUnauthorizedError)
      .addError(ControlPlaneForbiddenError)
      .addError(ControlPlaneStorageError),
  )
  .add(
    HttpApiEndpoint.get("get")`/organizations/${organizationIdParam}`
      .addSuccess(OrganizationSchema)
      .addError(ControlPlaneBadRequestError)
      .addError(ControlPlaneUnauthorizedError)
      .addError(ControlPlaneForbiddenError)
      .addError(ControlPlaneNotFoundError)
      .addError(ControlPlaneStorageError),
  )
  .add(
    HttpApiEndpoint.patch("update")`/organizations/${organizationIdParam}`
      .setPayload(UpdateOrganizationPayloadSchema)
      .addSuccess(OrganizationSchema)
      .addError(ControlPlaneBadRequestError)
      .addError(ControlPlaneUnauthorizedError)
      .addError(ControlPlaneForbiddenError)
      .addError(ControlPlaneNotFoundError)
      .addError(ControlPlaneStorageError),
  )
  .add(
    HttpApiEndpoint.del("remove")`/organizations/${organizationIdParam}`
      .addSuccess(Schema.Struct({ removed: Schema.Boolean }))
      .addError(ControlPlaneBadRequestError)
      .addError(ControlPlaneUnauthorizedError)
      .addError(ControlPlaneForbiddenError)
      .addError(ControlPlaneStorageError),
  )
  .prefix("/v1") {}
