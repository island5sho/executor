import { HttpApiBuilder } from "@effect/platform";
import type { OrganizationId, WorkspaceId } from "#schema";

import { requirePermission, withPolicy } from "#domain";
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  removeWorkspace,
  updateWorkspace,
} from "../../runtime/organizations-operations";

import { ControlPlaneApi } from "../api";
import {
  withRequestActor,
  withWorkspaceRequestActor,
} from "../http-auth";

const requireReadWorkspace = (workspaceId: WorkspaceId) =>
  requirePermission({
    permission: "workspace:read",
    workspaceId,
  });

const requireManageWorkspace = (workspaceId: WorkspaceId) =>
  requirePermission({
    permission: "workspace:manage",
    workspaceId,
  });

const requireOrganizationWorkspaceRead = (organizationId: OrganizationId) =>
  requirePermission({
    permission: "workspace:read",
    organizationId,
  });

const requireOrganizationWorkspaceManage = (organizationId: OrganizationId) =>
  requirePermission({
    permission: "workspace:manage",
    organizationId,
  });

export const ControlPlaneWorkspacesLive = HttpApiBuilder.group(
  ControlPlaneApi,
  "workspaces",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        withRequestActor("workspaces.list", () =>
          withPolicy(
            requireOrganizationWorkspaceRead(path.organizationId),
          )(listWorkspaces(path.organizationId))
        ),
      )
      .handle("create", ({ path, payload }) =>
        withRequestActor("workspaces.create", (actor) =>
          withPolicy(
            requireOrganizationWorkspaceManage(path.organizationId),
          )(
            createWorkspace({
              organizationId: path.organizationId,
              payload,
              createdByAccountId: actor.principal.accountId,
            }),
          ),
        ),
      )
      .handle("get", ({ path }) =>
        withWorkspaceRequestActor("workspaces.get", path.workspaceId, () =>
          withPolicy(requireReadWorkspace(path.workspaceId))(
            getWorkspace(path.workspaceId),
          ),
        ),
      )
      .handle("update", ({ path, payload }) =>
        withWorkspaceRequestActor("workspaces.update", path.workspaceId, () =>
          withPolicy(requireManageWorkspace(path.workspaceId))(
            updateWorkspace({ workspaceId: path.workspaceId, payload }),
          ),
        ),
      )
      .handle("remove", ({ path }) =>
        withWorkspaceRequestActor("workspaces.remove", path.workspaceId, () =>
          withPolicy(requireManageWorkspace(path.workspaceId))(
            removeWorkspace({ workspaceId: path.workspaceId }),
          ),
        ),
      ),
);
