import {
  PersistentToolApprovalPolicyStoreError,
  createPersistentToolApprovalPolicy,
  type PersistentToolApprovalRecord,
  type PersistentToolApprovalStore,
  type ToolApprovalPolicy,
} from "@executor-v2/engine";
import { SourceStoreError } from "@executor-v2/persistence-ports";
import {
  type LocalStateSnapshot,
  type LocalStateStore,
  type LocalStateStoreError,
} from "@executor-v2/persistence-local";
import {
  makeControlPlaneApprovalsService,
  type ControlPlaneApprovalsServiceShape,
} from "@executor-v2/management-api";
import { type Approval } from "@executor-v2/schema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const toSourceStoreError = (
  operation: string,
  message: string,
  details: string | null,
): SourceStoreError =>
  new SourceStoreError({
    operation,
    backend: "local-file",
    location: "snapshot.json",
    message,
    reason: null,
    details,
  });

const toSourceStoreErrorFromLocalState = (
  operation: string,
  error: LocalStateStoreError,
): SourceStoreError =>
  toSourceStoreError(operation, error.message, error.details ?? error.reason ?? null);

const findApprovalIndex = (
  approvals: ReadonlyArray<Approval>,
  workspaceId: string,
  approvalId: string,
): number =>
  approvals.findIndex(
    (approval) => approval.workspaceId === workspaceId && approval.id === approvalId,
  );

const sortApprovals = (approvals: ReadonlyArray<Approval>): Array<Approval> =>
  [...approvals].sort((left, right) => right.requestedAt - left.requestedAt);

const toPersistentApprovalStoreError = (
  operation: string,
  message: string,
  details: string | null,
): PersistentToolApprovalPolicyStoreError =>
  new PersistentToolApprovalPolicyStoreError({
    operation,
    message,
    details,
  });

const toPersistentApprovalStoreErrorFromLocalState = (
  operation: string,
  error: LocalStateStoreError,
): PersistentToolApprovalPolicyStoreError =>
  toPersistentApprovalStoreError(operation, error.message, error.details ?? error.reason ?? null);

const toPersistentApprovalRecord = (approval: Approval): PersistentToolApprovalRecord => ({
  approvalId: approval.id,
  workspaceId: approval.workspaceId,
  runId: approval.taskRunId,
  callId: approval.callId,
  toolPath: approval.toolPath,
  status: approval.status,
  reason: approval.reason,
});

const updateApproval = (
  snapshot: LocalStateSnapshot,
  index: number,
  nextApproval: Approval,
): LocalStateSnapshot => {
  const approvals = [...snapshot.approvals];
  approvals[index] = nextApproval;

  return {
    ...snapshot,
    generatedAt: Date.now(),
    approvals,
  };
};

export type PmPersistentToolApprovalPolicyOptions = {
  requireApprovals?: boolean;
  retryAfterMs?: number;
};

export const createPmPersistentToolApprovalPolicy = (
  localStateStore: LocalStateStore,
  options: PmPersistentToolApprovalPolicyOptions = {},
): ToolApprovalPolicy => {
  const missingSnapshotError = (operation: string): PersistentToolApprovalPolicyStoreError =>
    toPersistentApprovalStoreError(
      operation,
      "Persistent approvals require an initialized local state snapshot",
      null,
    );

  const store: PersistentToolApprovalStore = {
    findByRunAndCall: (input) =>
      localStateStore.getSnapshot().pipe(
        Effect.mapError((error) =>
          toPersistentApprovalStoreErrorFromLocalState("approvals.read", error),
        ),
        Effect.flatMap((snapshotOption) => {
          const snapshot = Option.getOrNull(snapshotOption);
          if (snapshot === null) {
            return Effect.fail(missingSnapshotError("approvals.read"));
          }

          const approval =
            snapshot.approvals.find(
              (candidate) =>
                candidate.workspaceId === input.workspaceId &&
                candidate.taskRunId === input.runId &&
                candidate.callId === input.callId,
            ) ?? null;

          return Effect.succeed(approval ? toPersistentApprovalRecord(approval) : null);
        }),
      ),

    createPending: (input) =>
      localStateStore.getSnapshot().pipe(
        Effect.mapError((error) =>
          toPersistentApprovalStoreErrorFromLocalState("approvals.read", error),
        ),
        Effect.flatMap((snapshotOption) => {
          const snapshot = Option.getOrNull(snapshotOption);
          if (snapshot === null) {
            return Effect.fail(missingSnapshotError("approvals.create"));
          }

          const pendingApproval = {
            id: `apr_${crypto.randomUUID()}`,
            workspaceId: input.workspaceId,
            taskRunId: input.runId,
            callId: input.callId,
            toolPath: input.toolPath,
            status: "pending",
            inputPreviewJson: input.inputPreviewJson,
            reason: null,
            requestedAt: Date.now(),
            resolvedAt: null,
          } as Approval;

          const nextSnapshot: LocalStateSnapshot = {
            ...snapshot,
            generatedAt: Date.now(),
            approvals: [...snapshot.approvals, pendingApproval],
          };

          return localStateStore.writeSnapshot(nextSnapshot).pipe(
            Effect.mapError((error) =>
              toPersistentApprovalStoreErrorFromLocalState("approvals.write", error),
            ),
            Effect.as(toPersistentApprovalRecord(pendingApproval)),
          );
        }),
      ),
  };

  return createPersistentToolApprovalPolicy({
    store,
    requireApprovals: options.requireApprovals,
    retryAfterMs: options.retryAfterMs,
  });
};

export const createPmApprovalsService = (
  localStateStore: LocalStateStore,
): ControlPlaneApprovalsServiceShape =>
  makeControlPlaneApprovalsService({
    listApprovals: (workspaceId) =>
      Effect.gen(function* () {
        const snapshotOption = yield* localStateStore.getSnapshot().pipe(
          Effect.mapError((error) =>
            toSourceStoreErrorFromLocalState("approvals.list", error),
          ),
        );

        const snapshot = Option.getOrNull(snapshotOption);
        if (snapshot === null) {
          return [];
        }

        const approvals = snapshot.approvals.filter(
          (approval) => approval.workspaceId === workspaceId,
        );

        return sortApprovals(approvals);
      }),

    resolveApproval: (input) =>
      Effect.gen(function* () {
        const snapshotOption = yield* localStateStore.getSnapshot().pipe(
          Effect.mapError((error) =>
            toSourceStoreErrorFromLocalState("approvals.resolve", error),
          ),
        );

        const snapshot = Option.getOrNull(snapshotOption);
        if (snapshot === null) {
          return yield* toSourceStoreError(
            "approvals.resolve",
            "Approval snapshot not found",
            `workspace=${input.workspaceId} approval=${input.approvalId}`,
          );
        }

        const index = findApprovalIndex(
          snapshot.approvals,
          input.workspaceId,
          input.approvalId,
        );

        if (index < 0) {
          return yield* toSourceStoreError(
            "approvals.resolve",
            "Approval not found",
            `workspace=${input.workspaceId} approval=${input.approvalId}`,
          );
        }

        const approval = snapshot.approvals[index];
        if (approval.status !== "pending") {
          return yield* toSourceStoreError(
            "approvals.resolve",
            "Approval is not pending",
            `approval=${input.approvalId} status=${approval.status}`,
          );
        }

        const resolvedApproval: Approval = {
          ...approval,
          status: input.payload.status,
          reason: input.payload.reason ?? approval.reason ?? null,
          resolvedAt: Date.now(),
        };

        const nextSnapshot = updateApproval(snapshot, index, resolvedApproval);

        yield* localStateStore.writeSnapshot(nextSnapshot).pipe(
          Effect.mapError((error) =>
            toSourceStoreErrorFromLocalState("approvals.resolve_write", error),
          ),
        );

        return resolvedApproval;
      }),
  });
