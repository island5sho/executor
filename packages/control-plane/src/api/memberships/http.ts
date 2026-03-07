import { HttpApiBuilder } from "@effect/platform";
import type { OrganizationId } from "#schema";

import { requirePermission, withPolicy } from "#domain";
import {
  createMembership,
  listMemberships,
  removeMembership,
  updateMembership,
} from "../../runtime/organizations-operations";

import { ControlPlaneApi } from "../api";
import { withRequestActor } from "../http-auth";

const requireReadMemberships = (organizationId: OrganizationId) =>
  requirePermission({
    permission: "memberships:read",
    organizationId,
  });

const requireWriteMemberships = (organizationId: OrganizationId) =>
  requirePermission({
    permission: "memberships:write",
    organizationId,
  });

export const ControlPlaneMembershipsLive = HttpApiBuilder.group(
  ControlPlaneApi,
  "memberships",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        withRequestActor("memberships.list", () =>
          withPolicy(requireReadMemberships(path.organizationId))(
            listMemberships(path.organizationId),
          ),
        ),
      )
      .handle("create", ({ path, payload }) =>
        withRequestActor("memberships.create", () =>
          withPolicy(requireWriteMemberships(path.organizationId))(
            createMembership({ organizationId: path.organizationId, payload }),
          ),
        ),
      )
      .handle("update", ({ path, payload }) =>
        withRequestActor("memberships.update", () =>
          withPolicy(requireWriteMemberships(path.organizationId))(
            updateMembership({
              organizationId: path.organizationId,
              accountId: path.accountId,
              payload,
            }),
          ),
        ),
      )
      .handle("remove", ({ path }) =>
        withRequestActor("memberships.remove", () =>
          withPolicy(requireWriteMemberships(path.organizationId))(
            removeMembership({
              organizationId: path.organizationId,
              accountId: path.accountId,
            }),
          ),
        ),
      ),
);
