import { HttpApiBuilder } from "@effect/platform";
import type { WorkspaceId } from "#schema";

import { requirePermission, withPolicy } from "#domain";
import {
  createExecution,
  getExecution,
  resumeExecution,
} from "../../runtime/execution-service";

import { ControlPlaneApi } from "../api";
import { withWorkspaceRequestActor } from "../http-auth";

const requireExecuteWorkspace = (workspaceId: WorkspaceId) =>
  requirePermission({
    permission: "workspace:read",
    workspaceId,
  });

export const ControlPlaneExecutionsLive = HttpApiBuilder.group(
  ControlPlaneApi,
  "executions",
  (handlers) =>
    handlers
      .handle("create", ({ path, payload }) =>
        withWorkspaceRequestActor("executions.create", path.workspaceId, (actor) =>
          withPolicy(requireExecuteWorkspace(path.workspaceId))(
            createExecution({
              workspaceId: path.workspaceId,
              payload,
              createdByAccountId: actor.principal.accountId,
            }),
          ),
        ),
      )
      .handle("get", ({ path }) =>
        withWorkspaceRequestActor("executions.get", path.workspaceId, () =>
          withPolicy(requireExecuteWorkspace(path.workspaceId))(
            getExecution({
              workspaceId: path.workspaceId,
              executionId: path.executionId,
            }),
          ),
        ),
      )
      .handle("resume", ({ path, payload }) =>
        withWorkspaceRequestActor("executions.resume", path.workspaceId, (actor) =>
          withPolicy(requireExecuteWorkspace(path.workspaceId))(
            resumeExecution({
              workspaceId: path.workspaceId,
              executionId: path.executionId,
              payload,
              resumedByAccountId: actor.principal.accountId,
            }),
          ),
        ),
      ),
);
