import type {
  CreateMembershipPayload,
  UpdateMembershipPayload,
} from "../api/memberships/api";
import type {
  CreateOrganizationPayload,
  UpdateOrganizationPayload,
} from "../api/organizations/api";
import type {
  CreateWorkspacePayload,
  UpdateWorkspacePayload,
} from "../api/workspaces/api";
import {
  OrganizationIdSchema,
  OrganizationMemberIdSchema,
  WorkspaceIdSchema,
  type AccountId,
  type Organization,
  type OrganizationId,
  type OrganizationMembership,
  type Workspace,
  type WorkspaceId,
} from "#schema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  ensureOrganizationExists,
  ensureUniqueOrganizationSlug,
  mapPersistenceError,
  type Mutable,
} from "./operations-shared";
import {
  operationErrors,
} from "./operation-errors";
import {
  ControlPlaneStore,
  type ControlPlaneStoreShape,
} from "./store";

const organizationOps = {
  list: operationErrors("organizations.list"),
  create: operationErrors("organizations.create"),
  get: operationErrors("organizations.get"),
  update: operationErrors("organizations.update"),
  remove: operationErrors("organizations.remove"),
} as const;

const membershipOps = {
  list: operationErrors("memberships.list"),
  create: operationErrors("memberships.create"),
  update: operationErrors("memberships.update"),
  remove: operationErrors("memberships.remove"),
} as const;

const workspaceOps = {
  list: operationErrors("workspaces.list"),
  create: operationErrors("workspaces.create"),
  get: operationErrors("workspaces.get"),
  update: operationErrors("workspaces.update"),
  remove: operationErrors("workspaces.remove"),
} as const;

const listOrganizationsWithStore = (
  store: ControlPlaneStoreShape,
  input: { accountId: AccountId },
) =>
  Effect.gen(function* () {
    const memberships = yield* organizationOps.list.child("memberships").mapStorage(
      store.organizationMemberships.listByAccountId(input.accountId),
    );

    const activeOrganizationIds = Array.from(
      new Set(
        memberships
          .filter((membership) => membership.status === "active")
          .map((membership) => membership.organizationId),
      ),
    );

    const organizations = yield* Effect.forEach(activeOrganizationIds, (organizationId) =>
      organizationOps.list.child("organization").mapStorage(
        store.organizations.getById(organizationId),
      ).pipe(
        Effect.map((result) => (Option.isSome(result) ? result.value : null)),
      ));

    return organizations.filter((organization): organization is Organization => organization !== null);
  });

export const listOrganizations = (input: { accountId: AccountId }) =>
  Effect.flatMap(ControlPlaneStore, (store) => listOrganizationsWithStore(store, input));

export const createOrganization = (input: {
  payload: CreateOrganizationPayload;
  createdByAccountId?: Organization["createdByAccountId"];
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const name = input.payload.name;
      const now = Date.now();

      const slug = input.payload.slug
        ? input.payload.slug
        : yield* ensureUniqueOrganizationSlug(store, name, organizationOps.create);

      const organization: Organization = {
        id: OrganizationIdSchema.make(`org_${crypto.randomUUID()}`),
        slug,
        name,
        status: "active",
        createdByAccountId: input.createdByAccountId ?? null,
        createdAt: now,
        updatedAt: now,
      };

      const ownerMembership: OrganizationMembership | null = input.createdByAccountId
        ? {
            id: OrganizationMemberIdSchema.make(`org_mem_${crypto.randomUUID()}`),
            organizationId: organization.id,
            accountId: input.createdByAccountId,
            role: "owner",
            status: "active",
            billable: true,
            invitedByAccountId: null,
            joinedAt: now,
            createdAt: now,
            updatedAt: now,
          }
        : null;

      yield* mapPersistenceError(
        organizationOps.create,
        store.organizations.insertWithOwnerMembership(organization, ownerMembership),
      );

      return organization;
    }));

export const getOrganization = (input: {
  organizationId: OrganizationId;
  accountId: AccountId;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const membership = yield* organizationOps.get.child("membership").mapStorage(
        store.organizationMemberships.getByOrganizationAndAccount(
          input.organizationId,
          input.accountId,
        ),
      );

      if (Option.isNone(membership) || membership.value.status !== "active") {
        return yield* Effect.fail(
          organizationOps.get.notFound(
            "Organization not found",
            `organizationId=${input.organizationId}`,
          ),
        );
      }

      const existing = yield* organizationOps.get.mapStorage(
        store.organizations.getById(input.organizationId),
      );

      if (Option.isNone(existing)) {
        return yield* Effect.fail(
          organizationOps.get.notFound(
            "Organization not found",
            `organizationId=${input.organizationId}`,
          ),
        );
      }

      return existing.value;
    }));

export const updateOrganization = (input: {
  organizationId: OrganizationId;
  payload: UpdateOrganizationPayload;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const patch: Partial<Omit<Mutable<Organization>, "id" | "createdAt">> = {
        updatedAt: Date.now(),
      };

      if (input.payload.name !== undefined) {
        patch.name = input.payload.name;
      }
      if (input.payload.status !== undefined) {
        patch.status = input.payload.status;
      }

      const updated = yield* mapPersistenceError(
        organizationOps.update,
        store.organizations.update(input.organizationId, patch),
      );

      if (Option.isNone(updated)) {
        return yield* Effect.fail(
          organizationOps.update.notFound(
            "Organization not found",
            `organizationId=${input.organizationId}`,
          ),
        );
      }

      return updated.value;
    }));

export const removeOrganization = (input: { organizationId: OrganizationId }) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    organizationOps.remove.mapStorage(
      store.organizations.removeTreeById(input.organizationId),
    ).pipe(Effect.map((removed) => ({ removed })))
  );

export const listMemberships = (organizationId: OrganizationId) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      yield* ensureOrganizationExists(store, membershipOps.list, organizationId);

      return yield* membershipOps.list.mapStorage(
        store.organizationMemberships.listByOrganizationId(organizationId),
      );
    }));

export const createMembership = (input: {
  organizationId: OrganizationId;
  payload: CreateMembershipPayload;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      yield* ensureOrganizationExists(store, membershipOps.create, input.organizationId);

      const now = Date.now();
      const membership: OrganizationMembership = {
        id: OrganizationMemberIdSchema.make(`org_mem_${crypto.randomUUID()}`),
        organizationId: input.organizationId,
        accountId: input.payload.accountId,
        role: input.payload.role,
        status: input.payload.status ?? "active",
        billable: input.payload.billable ?? true,
        invitedByAccountId: input.payload.invitedByAccountId ?? null,
        joinedAt: (input.payload.status ?? "active") === "active" ? now : null,
        createdAt: now,
        updatedAt: now,
      };

      yield* mapPersistenceError(
        membershipOps.create,
        store.organizationMemberships.upsert(membership),
      );

      const stored = yield* membershipOps.create.mapStorage(
        store.organizationMemberships.getByOrganizationAndAccount(
          input.organizationId,
          input.payload.accountId,
        ),
      );
      if (Option.isNone(stored)) {
        return yield* Effect.fail(
          membershipOps.create.badRequest(
            "Membership was not persisted",
            `organizationId=${input.organizationId} accountId=${input.payload.accountId}`,
          ),
        );
      }

      return stored.value;
    }));

export const updateMembership = (input: {
  organizationId: OrganizationId;
  accountId: AccountId;
  payload: UpdateMembershipPayload;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      yield* ensureOrganizationExists(store, membershipOps.update, input.organizationId);

      const existing = yield* membershipOps.update.mapStorage(
        store.organizationMemberships.getByOrganizationAndAccount(
          input.organizationId,
          input.accountId,
        ),
      );

      if (Option.isNone(existing)) {
        return yield* Effect.fail(
          membershipOps.update.badRequest(
            "Membership not found",
            `organizationId=${input.organizationId} accountId=${input.accountId}`,
          ),
        );
      }

      const current = existing.value;
      const now = Date.now();
      const next: OrganizationMembership = {
        ...current,
        role: input.payload.role ?? current.role,
        status: input.payload.status ?? current.status,
        billable: input.payload.billable ?? current.billable,
        joinedAt:
          (input.payload.status ?? current.status) === "active"
            ? (current.joinedAt ?? now)
            : current.joinedAt,
        updatedAt: now,
      };

      yield* mapPersistenceError(
        membershipOps.update,
        store.organizationMemberships.upsert(next),
      );

      return next;
    }));

export const removeMembership = (input: {
  organizationId: OrganizationId;
  accountId: AccountId;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      yield* ensureOrganizationExists(store, membershipOps.remove, input.organizationId);

      const removed = yield* membershipOps.remove.mapStorage(
        store.organizationMemberships.removeByOrganizationAndAccount(
          input.organizationId,
          input.accountId,
        ),
      );

      return { removed };
    }));

export const listWorkspaces = (organizationId: OrganizationId) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      yield* ensureOrganizationExists(store, workspaceOps.list, organizationId);

      return yield* workspaceOps.list.mapStorage(
        store.workspaces.listByOrganizationId(organizationId),
      );
    }));

export const createWorkspace = (input: {
  organizationId: OrganizationId;
  payload: CreateWorkspacePayload;
  createdByAccountId?: Workspace["createdByAccountId"];
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      yield* ensureOrganizationExists(store, workspaceOps.create, input.organizationId);
      const name = input.payload.name;
      const now = Date.now();

      const workspace: Workspace = {
        id: WorkspaceIdSchema.make(`ws_${crypto.randomUUID()}`),
        organizationId: input.organizationId,
        name,
        createdByAccountId: input.createdByAccountId ?? null,
        createdAt: now,
        updatedAt: now,
      };

      yield* mapPersistenceError(
        workspaceOps.create,
        store.workspaces.insert(workspace),
      );

      return workspace;
    }));

export const getWorkspace = (workspaceId: WorkspaceId) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const existing = yield* workspaceOps.get.mapStorage(
        store.workspaces.getById(workspaceId),
      );

      if (Option.isNone(existing)) {
        return yield* Effect.fail(
          workspaceOps.get.notFound(
            "Workspace not found",
            `workspaceId=${workspaceId}`,
          ),
        );
      }

      return existing.value;
    }));

export const updateWorkspace = (input: {
  workspaceId: WorkspaceId;
  payload: UpdateWorkspacePayload;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const patch: Partial<
        Omit<Mutable<Workspace>, "id" | "organizationId" | "createdAt">
      > = {
        updatedAt: Date.now(),
      };

      if (input.payload.name !== undefined) {
        patch.name = input.payload.name;
      }

      const updated = yield* mapPersistenceError(
        workspaceOps.update,
        store.workspaces.update(input.workspaceId, patch),
      );

      if (Option.isNone(updated)) {
        return yield* Effect.fail(
          workspaceOps.update.notFound(
            "Workspace not found",
            `workspaceId=${input.workspaceId}`,
          ),
        );
      }

      return updated.value;
    }));

export const removeWorkspace = (input: { workspaceId: WorkspaceId }) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    workspaceOps.remove.mapStorage(
      store.workspaces.removeById(input.workspaceId),
    ).pipe(Effect.map((removed) => ({ removed })))
  );
