import { HttpApiBuilder } from "@effect/platform";
import type { WorkspaceId } from "#schema";

import { requirePermission, withPolicy } from "#domain";
import {
  createSource,
  getSource,
  listSources,
  removeSource,
  updateSource,
} from "../../runtime/sources-operations";

import { ControlPlaneApi } from "../api";
import { withWorkspaceRequestActor } from "../http-auth";

const requireReadSources = (workspaceId: WorkspaceId) =>
  requirePermission({
    permission: "sources:read",
    workspaceId,
  });

const requireWriteSources = (workspaceId: WorkspaceId) =>
  requirePermission({
    permission: "sources:write",
    workspaceId,
  });

export const ControlPlaneSourcesLive = HttpApiBuilder.group(
  ControlPlaneApi,
  "sources",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        withWorkspaceRequestActor("sources.list", path.workspaceId, () =>
          withPolicy(requireReadSources(path.workspaceId))(
            listSources(path.workspaceId),
          ),
        ),
      )
      .handle("create", ({ path, payload }) =>
        withWorkspaceRequestActor("sources.create", path.workspaceId, () =>
          withPolicy(requireWriteSources(path.workspaceId))(
            createSource({ workspaceId: path.workspaceId, payload }),
          ),
        ),
      )
      .handle("get", ({ path }) =>
        withWorkspaceRequestActor("sources.get", path.workspaceId, () =>
          withPolicy(requireReadSources(path.workspaceId))(
            getSource({
              workspaceId: path.workspaceId,
              sourceId: path.sourceId,
            }),
          ),
        ),
      )
      .handle("update", ({ path, payload }) =>
        withWorkspaceRequestActor("sources.update", path.workspaceId, () =>
          withPolicy(requireWriteSources(path.workspaceId))(
            updateSource({
              workspaceId: path.workspaceId,
              sourceId: path.sourceId,
              payload,
            }),
          ),
        ),
      )
      .handle("remove", ({ path }) =>
        withWorkspaceRequestActor("sources.remove", path.workspaceId, () =>
          withPolicy(requireWriteSources(path.workspaceId))(
            removeSource({
              workspaceId: path.workspaceId,
              sourceId: path.sourceId,
            }),
          ),
        ),
      ),
);
