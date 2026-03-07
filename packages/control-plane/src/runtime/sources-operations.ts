import type {
  CreateSourcePayload,
  UpdateSourcePayload,
} from "../api/sources/api";
import {
  SourceIdSchema,
  type SourceId,
  type WorkspaceId,
} from "#schema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  createSourceFromPayload,
  projectSourceFromStorage,
  projectSourcesFromStorage,
  splitSourceForStorage,
  updateSourceFromPayload,
} from "./source-definitions";
import {
  mapPersistenceError,
} from "./operations-shared";
import {
  operationErrors,
} from "./operation-errors";
import { ControlPlaneStore } from "./store";

const sourceOps = {
  list: operationErrors("sources.list"),
  create: operationErrors("sources.create"),
  get: operationErrors("sources.get"),
  update: operationErrors("sources.update"),
  remove: operationErrors("sources.remove"),
} as const;

export const listSources = (workspaceId: WorkspaceId) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const sourceRecords = yield* sourceOps.list.child("records").mapStorage(
        store.sources.listByWorkspaceId(workspaceId),
      );
      const credentialBindings = yield* sourceOps.list.child("bindings").mapStorage(
        store.sourceCredentialBindings.listByWorkspaceId(workspaceId),
      );

      return yield* projectSourcesFromStorage({
        sourceRecords,
        credentialBindings,
      }).pipe(
        Effect.mapError((error) =>
          sourceOps.list.unknownStorage(
            error,
            "Failed projecting stored sources",
          ),
        ),
      );
    }));

export const createSource = (input: {
  workspaceId: WorkspaceId;
  payload: CreateSourcePayload;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const now = Date.now();

      const source = yield* createSourceFromPayload({
        workspaceId: input.workspaceId,
        sourceId: SourceIdSchema.make(`src_${crypto.randomUUID()}`),
        payload: input.payload,
        now,
      }).pipe(
        Effect.mapError((cause) =>
          sourceOps.create.badRequest(
            "Invalid source definition",
            cause instanceof Error ? cause.message : String(cause),
          ),
        ),
      );

      const { sourceRecord, credentialBinding } = splitSourceForStorage({
        source,
      });

      yield* mapPersistenceError(
        sourceOps.create.child("source"),
        store.sources.insert(sourceRecord),
      );
      if (credentialBinding !== null) {
        yield* mapPersistenceError(
          sourceOps.create.child("binding"),
          store.sourceCredentialBindings.upsert(credentialBinding),
        );
      }

      return source;
    }));

export const getSource = (input: {
  workspaceId: WorkspaceId;
  sourceId: SourceId;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const existing = yield* sourceOps.get.mapStorage(
        store.sources.getByWorkspaceAndId(input.workspaceId, input.sourceId),
      );

      if (Option.isNone(existing)) {
        return yield* Effect.fail(
          sourceOps.get.notFound(
            "Source not found",
            `workspaceId=${input.workspaceId} sourceId=${input.sourceId}`,
          ),
        );
      }

      const credentialBinding = yield* sourceOps.get.child("binding").mapStorage(
        store.sourceCredentialBindings.getByWorkspaceAndSourceId(
          input.workspaceId,
          input.sourceId,
        ),
      );

      return yield* projectSourceFromStorage({
        sourceRecord: existing.value,
        credentialBinding: Option.isSome(credentialBinding) ? credentialBinding.value : null,
      }).pipe(
        Effect.mapError((cause) =>
          sourceOps.get.unknownStorage(
            cause,
            "Failed projecting stored source",
          ),
        ),
      );
    }));

export const updateSource = (input: {
  workspaceId: WorkspaceId;
  sourceId: SourceId;
  payload: UpdateSourcePayload;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    Effect.gen(function* () {
      const existing = yield* sourceOps.update.child("existing").mapStorage(
        store.sources.getByWorkspaceAndId(input.workspaceId, input.sourceId),
      );

      if (Option.isNone(existing)) {
        return yield* Effect.fail(
          sourceOps.update.notFound(
            "Source not found",
            `workspaceId=${input.workspaceId} sourceId=${input.sourceId}`,
          ),
        );
      }

      const existingBinding = yield* sourceOps.update.child("binding").mapStorage(
        store.sourceCredentialBindings.getByWorkspaceAndSourceId(
          input.workspaceId,
          input.sourceId,
        ),
      );

      const existingSource = yield* projectSourceFromStorage({
        sourceRecord: existing.value,
        credentialBinding: Option.isSome(existingBinding) ? existingBinding.value : null,
      }).pipe(
        Effect.mapError((cause) =>
          sourceOps.update.unknownStorage(
            cause,
            "Failed projecting stored source",
          ),
        ),
      );

      const updatedSource = yield* updateSourceFromPayload({
        source: existingSource,
        payload: input.payload,
        now: Date.now(),
      }).pipe(
        Effect.mapError((cause) =>
          sourceOps.update.badRequest(
            "Invalid source definition",
            cause instanceof Error ? cause.message : String(cause),
          ),
        ),
      );

      const { sourceRecord, credentialBinding } = splitSourceForStorage({
        source: updatedSource,
      });

      const stored = yield* mapPersistenceError(
        sourceOps.update.child("source"),
        store.sources.update(input.workspaceId, input.sourceId, {
          ...sourceRecord,
          updatedAt: updatedSource.updatedAt,
        }),
      );

      if (Option.isNone(stored)) {
        return yield* Effect.fail(
          sourceOps.update.notFound(
            "Source not found",
            `workspaceId=${input.workspaceId} sourceId=${input.sourceId}`,
          ),
        );
      }

      if (credentialBinding === null) {
        yield* sourceOps.update.child("binding.remove").mapStorage(
          store.sourceCredentialBindings.removeByWorkspaceAndSourceId(
            input.workspaceId,
            input.sourceId,
          ),
        );
      } else {
        yield* mapPersistenceError(
          sourceOps.update.child("binding"),
          store.sourceCredentialBindings.upsert(credentialBinding),
        );
      }

      return updatedSource;
    }));

export const removeSource = (input: {
  workspaceId: WorkspaceId;
  sourceId: SourceId;
}) =>
  Effect.flatMap(ControlPlaneStore, (store) =>
    sourceOps.remove.mapStorage(
      store.sources.removeByWorkspaceAndId(input.workspaceId, input.sourceId),
    ).pipe(Effect.map((removed) => ({ removed })))
  );
