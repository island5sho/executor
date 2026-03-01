import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import type {
  ToolApprovalDecision,
  ToolApprovalPolicy,
  ToolApprovalRequest,
} from "./tool-registry";

export type PersistentToolApprovalStatus = "pending" | "approved" | "denied" | "expired";

export type PersistentToolApprovalRecord = {
  approvalId: string;
  workspaceId: string;
  runId: string;
  callId: string;
  toolPath: string;
  status: PersistentToolApprovalStatus;
  reason: string | null;
};

export class PersistentToolApprovalPolicyStoreError extends Data.TaggedError(
  "PersistentToolApprovalPolicyStoreError",
)<{
  operation: string;
  message: string;
  details: string | null;
}> {}

export type PersistentToolApprovalStore = {
  findByRunAndCall: (input: {
    workspaceId: string;
    runId: string;
    callId: string;
  }) => Effect.Effect<
    PersistentToolApprovalRecord | null,
    PersistentToolApprovalPolicyStoreError
  >;
  createPending: (input: {
    workspaceId: string;
    runId: string;
    callId: string;
    toolPath: string;
    inputPreviewJson: string;
  }) => Effect.Effect<PersistentToolApprovalRecord, PersistentToolApprovalPolicyStoreError>;
};

export type CreatePersistentToolApprovalPolicyOptions = {
  store: PersistentToolApprovalStore;
  requireApprovals?: boolean;
  retryAfterMs?: number;
  serializeInputPreview?: (input: Record<string, unknown> | undefined) => string;
  onStoreError?: (
    error: PersistentToolApprovalPolicyStoreError,
    request: ToolApprovalRequest,
  ) => ToolApprovalDecision;
};

const defaultPendingRetryAfterMs = 1_000;

const normalizePendingRetryAfterMs = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return defaultPendingRetryAfterMs;
  }

  return Math.round(value);
};

const defaultSerializeInputPreview = (input: Record<string, unknown> | undefined): string => {
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return "{}";
  }
};

const deniedMessageFromRecord = (record: PersistentToolApprovalRecord): string =>
  record.reason ?? `Tool call denied: ${record.toolPath}`;

const defaultStoreErrorDecision = (
  error: PersistentToolApprovalPolicyStoreError,
  request: ToolApprovalRequest,
): ToolApprovalDecision => ({
  kind: "denied",
  error:
    error.details && error.details.length > 0
      ? `${error.message}: ${error.details}`
      : `${error.message} [tool=${request.toolPath}]`,
});

export const createPersistentToolApprovalPolicy = (
  options: CreatePersistentToolApprovalPolicyOptions,
): ToolApprovalPolicy => {
  const requireApprovals = options.requireApprovals === true;
  const retryAfterMs = normalizePendingRetryAfterMs(options.retryAfterMs);
  const serializeInputPreview = options.serializeInputPreview ?? defaultSerializeInputPreview;
  const onStoreError = options.onStoreError ?? defaultStoreErrorDecision;

  return {
    evaluate: (input) =>
      Effect.gen(function* () {
        const shouldRequireApproval = requireApprovals || input.defaultMode === "required";
        if (!shouldRequireApproval) {
          return {
            kind: "approved",
          } satisfies ToolApprovalDecision;
        }

        if (!input.workspaceId) {
          return {
            kind: "denied",
            error: `Tool approval requires workspaceId for ${input.toolPath}`,
          } satisfies ToolApprovalDecision;
        }

        const existing = yield* options.store.findByRunAndCall({
          workspaceId: input.workspaceId,
          runId: input.runId,
          callId: input.callId,
        });

        if (existing !== null) {
          if (existing.status === "approved") {
            return {
              kind: "approved",
            } satisfies ToolApprovalDecision;
          }

          if (existing.status === "pending") {
            return {
              kind: "pending",
              approvalId: existing.approvalId,
              retryAfterMs,
              error: existing.reason ?? undefined,
            } satisfies ToolApprovalDecision;
          }

          return {
            kind: "denied",
            error: deniedMessageFromRecord(existing),
          } satisfies ToolApprovalDecision;
        }

        const pending = yield* options.store.createPending({
          workspaceId: input.workspaceId,
          runId: input.runId,
          callId: input.callId,
          toolPath: input.toolPath,
          inputPreviewJson: serializeInputPreview(input.input),
        });

        return {
          kind: "pending",
          approvalId: pending.approvalId,
          retryAfterMs,
        } satisfies ToolApprovalDecision;
      }).pipe(
        Effect.catchTag("PersistentToolApprovalPolicyStoreError", (error) =>
          Effect.succeed(onStoreError(error, input)),
        ),
        Effect.runPromise,
      ),
  };
};
