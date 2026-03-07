import type {
  CreatePolicyPayload,
  UpdatePolicyPayload,
} from "../api/policies/api";
import {
  PolicyIdSchema,
  type Policy,
  type PolicyId,
  type WorkspaceId,
} from "#schema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  mapPersistenceError,
  parseJsonString,
  type Mutable,
} from "./operations-shared";
import {
  operationErrors,
} from "./operation-errors";
import { ControlPlaneStore } from "./store";

const policyOps = {
  list: operationErrors("policies.list"),
  create: operationErrors("policies.create"),
  get: operationErrors("policies.get"),
  update: operationErrors("policies.update"),
  remove: operationErrors("policies.remove"),
} as const;

export const listPolicies = (workspaceId: WorkspaceId) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    policyOps.list.mapStorage(
      store.policies.listByWorkspaceId(workspaceId),
    )
  );

export const createPolicy = (input: {
  workspaceId: WorkspaceId;
  payload: CreatePolicyPayload;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const now = Date.now();

      const policy: Policy = {
        id: PolicyIdSchema.make(`pol_${crypto.randomUUID()}`),
        workspaceId: input.workspaceId,
        targetAccountId: input.payload.targetAccountId ?? null,
        clientId: input.payload.clientId ?? null,
        resourceType: input.payload.resourceType ?? "tool_path",
        resourcePattern: input.payload.resourcePattern ?? "*",
        matchType: input.payload.matchType ?? "glob",
        effect: input.payload.effect ?? "allow",
        approvalMode: input.payload.approvalMode ?? "auto",
        argumentConditionsJson: input.payload.argumentConditionsJson ?? null,
        priority: input.payload.priority ?? 0,
        enabled: input.payload.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      };

      if (policy.argumentConditionsJson !== null) {
        yield* parseJsonString(
          policyOps.create,
          "argumentConditionsJson",
          policy.argumentConditionsJson,
        );
      }

      yield* mapPersistenceError(
        policyOps.create,
        store.policies.insert(policy),
      );

      return policy;
    }));

export const getPolicy = (input: {
  workspaceId: WorkspaceId;
  policyId: PolicyId;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const existing = yield* policyOps.get.mapStorage(
        store.policies.getById(input.policyId),
      );

      if (Option.isNone(existing) || existing.value.workspaceId !== input.workspaceId) {
        return yield* Effect.fail(
          policyOps.get.notFound(
            "Policy not found",
            `workspaceId=${input.workspaceId} policyId=${input.policyId}`,
          ),
        );
      }

      return existing.value;
    }));

export const updatePolicy = (input: {
  workspaceId: WorkspaceId;
  policyId: PolicyId;
  payload: UpdatePolicyPayload;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const existing = yield* policyOps.update.mapStorage(
        store.policies.getById(input.policyId),
      );
      if (Option.isNone(existing) || existing.value.workspaceId !== input.workspaceId) {
        return yield* Effect.fail(
          policyOps.update.notFound(
            "Policy not found",
            `workspaceId=${input.workspaceId} policyId=${input.policyId}`,
          ),
        );
      }

      const patch: Partial<Omit<Mutable<Policy>, "id" | "workspaceId" | "createdAt">> = {
        updatedAt: Date.now(),
      };

      if (input.payload.targetAccountId !== undefined) {
        patch.targetAccountId = input.payload.targetAccountId;
      }
      if (input.payload.clientId !== undefined) {
        patch.clientId = input.payload.clientId;
      }
      if (input.payload.resourceType !== undefined) {
        patch.resourceType = input.payload.resourceType;
      }
      if (input.payload.resourcePattern !== undefined) {
        patch.resourcePattern = input.payload.resourcePattern;
      }
      if (input.payload.matchType !== undefined) {
        patch.matchType = input.payload.matchType;
      }
      if (input.payload.effect !== undefined) {
        patch.effect = input.payload.effect;
      }
      if (input.payload.approvalMode !== undefined) {
        patch.approvalMode = input.payload.approvalMode;
      }
      if (input.payload.argumentConditionsJson !== undefined) {
        if (input.payload.argumentConditionsJson !== null) {
          yield* parseJsonString(
            policyOps.update,
            "argumentConditionsJson",
            input.payload.argumentConditionsJson,
          );
        }
        patch.argumentConditionsJson = input.payload.argumentConditionsJson;
      }
      if (input.payload.priority !== undefined) {
        patch.priority = input.payload.priority;
      }
      if (input.payload.enabled !== undefined) {
        patch.enabled = input.payload.enabled;
      }

      const updated = yield* mapPersistenceError(
        policyOps.update,
        store.policies.update(input.policyId, patch),
      );
      if (Option.isNone(updated)) {
        return yield* Effect.fail(
          policyOps.update.notFound(
            "Policy not found",
            `workspaceId=${input.workspaceId} policyId=${input.policyId}`,
          ),
        );
      }

      return updated.value;
    }));

export const removePolicy = (input: {
  workspaceId: WorkspaceId;
  policyId: PolicyId;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const existing = yield* policyOps.remove.mapStorage(
        store.policies.getById(input.policyId),
      );
      if (Option.isNone(existing) || existing.value.workspaceId !== input.workspaceId) {
        return { removed: false };
      }

      const removed = yield* policyOps.remove.mapStorage(
        store.policies.removeById(input.policyId),
      );

      return { removed };
    }));
