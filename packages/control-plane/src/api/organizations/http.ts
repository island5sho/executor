import { HttpApiBuilder } from "@effect/platform";
import type { OrganizationId } from "#schema";

import { requirePermission, withPolicy } from "#domain";
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  removeOrganization,
  updateOrganization,
} from "../../runtime/organizations-operations";

import { ControlPlaneApi } from "../api";
import { withRequestActor } from "../http-auth";

const requireReadOrganizations = requirePermission({
  permission: "organizations:read",
});

const requireManageOrganizations = (organizationId: OrganizationId) =>
  requirePermission({
    permission: "organizations:manage",
    organizationId,
  });

export const ControlPlaneOrganizationsLive = HttpApiBuilder.group(
  ControlPlaneApi,
  "organizations",
  (handlers) =>
    handlers
      .handle("list", () =>
        withRequestActor("organizations.list", (actor) =>
          withPolicy(requireReadOrganizations)(
            listOrganizations({
              accountId: actor.principal.accountId,
            }),
          ),
        ),
      )
      .handle("create", ({ payload }) =>
        withRequestActor("organizations.create", (actor) =>
          createOrganization({
            payload,
            createdByAccountId: actor.principal.accountId,
          }),
        ),
      )
      .handle("get", ({ path }) =>
        withRequestActor("organizations.get", (actor) =>
          withPolicy(requireReadOrganizations)(
            getOrganization({
              organizationId: path.organizationId,
              accountId: actor.principal.accountId,
            }),
          ),
        ),
      )
      .handle("update", ({ path, payload }) =>
        withRequestActor("organizations.update", () =>
          withPolicy(requireManageOrganizations(path.organizationId))(
            updateOrganization({
              organizationId: path.organizationId,
              payload,
            }),
          ),
        ),
      )
      .handle("remove", ({ path }) =>
        withRequestActor("organizations.remove", () =>
          withPolicy(requireManageOrganizations(path.organizationId))(
            removeOrganization({ organizationId: path.organizationId }),
          ),
        ),
      ),
);
