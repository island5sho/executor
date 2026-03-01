import { describe, expect, it } from "@effect/vitest";
import { convexTest } from "convex-test";
import * as Effect from "effect/Effect";

import { api, internal } from "./_generated/api";
import { executeRunImpl } from "./executor";
import schema from "./schema";

const runtimeInternal = internal as any;

const setup = () =>
  convexTest(schema, {
    "./http.ts": () => import("./http"),
    "./mcp.ts": () => import("./mcp"),
    "./executor.ts": () => import("./executor"),
    "./runtimeCallbacks.ts": () => import("./runtimeCallbacks"),
    "./source_tool_registry.ts": () => import("./source_tool_registry"),
    "./task_runs.ts": () => import("./task_runs"),
    "./controlPlane.ts": () => import("./controlPlane"),
    "./_generated/api.js": () => import("./_generated/api.js"),
  });

describe("Convex executor and control-plane", () => {
  it.effect("executes code via executeRunImpl", () =>
    Effect.gen(function* () {
      const result = yield* executeRunImpl({
        code: "return 6 * 7;",
      });

      expect(result.status).toBe("completed");
      expect(result.result).toBe(42);
    }),
  );

  it.effect("upserts, lists, and removes sources", () =>
    Effect.gen(function* () {
      const t = setup();

      const added = (yield* Effect.tryPromise(() =>
        t.mutation(api.controlPlane.upsertSource, {
          workspaceId: "ws_1",
          payload: {
            id: "src_1",
            name: "Weather",
            kind: "openapi",
            endpoint: "https://example.com/openapi.json",
            enabled: true,
            configJson: "{}",
            status: "draft",
            sourceHash: null,
            lastError: null,
          },
        }),
      )) as {
        id: string;
        workspaceId: string;
        name: string;
      };

      expect(added.id).toBe("src_1");
      expect(added.workspaceId).toBe("ws_1");
      expect(added.name).toBe("Weather");

      const listed = (yield* Effect.tryPromise(() =>
        t.query(api.controlPlane.listSources, {
          workspaceId: "ws_1",
        }),
      )) as Array<{
        id: string;
      }>;

      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe("src_1");

      const removed = (yield* Effect.tryPromise(() =>
        t.mutation(api.controlPlane.removeSource, {
          workspaceId: "ws_1",
          sourceId: "src_1",
        }),
      )) as {
        removed: boolean;
      };

      expect(removed.removed).toBe(true);

      const listedAfterRemove = (yield* Effect.tryPromise(() =>
        t.query(api.controlPlane.listSources, {
          workspaceId: "ws_1",
        }),
      )) as Array<unknown>;

      expect(listedAfterRemove).toHaveLength(0);
    }),
  );

  it.effect("persists approval state for runtime tool calls", () =>
    Effect.gen(function* () {
      const t = setup();

      const missingRunDecision = (yield* Effect.tryPromise(() =>
        t.mutation(runtimeInternal.source_tool_registry.evaluateToolApproval, {
          workspaceId: "ws_1",
          runId: "run_approval_1",
          callId: "call_approval_1",
          toolPath: "github.repos.delete",
          inputPreviewJson: "{}",
          defaultMode: "auto",
          requireApprovals: true,
          retryAfterMs: 333,
        }),
      )) as {
        kind: "approved" | "pending" | "denied";
        error?: string;
      };

      expect(missingRunDecision.kind).toBe("denied");
      expect(missingRunDecision.error).toContain("Unknown run for approval request");

      yield* Effect.tryPromise(() =>
        t.mutation(runtimeInternal.task_runs.startTaskRun, {
          workspaceId: "ws_1",
          runId: "run_approval_1",
        }),
      );

      // First evaluation writes a pending approval row when this runId/callId is unseen.
      const firstDecision = (yield* Effect.tryPromise(() =>
        t.mutation(runtimeInternal.source_tool_registry.evaluateToolApproval, {
          workspaceId: "ws_1",
          runId: "run_approval_1",
          callId: "call_approval_1",
          toolPath: "github.repos.delete",
          inputPreviewJson: "{}",
          defaultMode: "auto",
          requireApprovals: true,
          retryAfterMs: 333,
        }),
      )) as {
        kind: "approved" | "pending" | "denied";
        approvalId?: string;
        retryAfterMs?: number;
      };

      expect(firstDecision.kind).toBe("pending");
      expect(firstDecision.retryAfterMs).toBe(333);
      expect(firstDecision.approvalId).toBeTypeOf("string");

      const secondDecision = (yield* Effect.tryPromise(() =>
        t.mutation(runtimeInternal.source_tool_registry.evaluateToolApproval, {
          workspaceId: "ws_1",
          runId: "run_approval_1",
          callId: "call_approval_1",
          toolPath: "github.repos.delete",
          inputPreviewJson: "{}",
          defaultMode: "auto",
          requireApprovals: true,
          retryAfterMs: 333,
        }),
      )) as {
        kind: "approved" | "pending" | "denied";
        approvalId?: string;
      };

      expect(secondDecision.kind).toBe("pending");
      expect(secondDecision.approvalId).toBe(firstDecision.approvalId);

      const approvalId = firstDecision.approvalId;
      if (!approvalId) {
        throw new Error("expected approval id");
      }

      yield* Effect.tryPromise(() =>
        t.mutation(api.controlPlane.resolveApproval, {
          workspaceId: "ws_1",
          approvalId,
          payload: {
            status: "approved",
            reason: "approved by test",
          },
        }),
      );

      const resolvedDecision = (yield* Effect.tryPromise(() =>
        t.mutation(runtimeInternal.source_tool_registry.evaluateToolApproval, {
          workspaceId: "ws_1",
          runId: "run_approval_1",
          callId: "call_approval_1",
          toolPath: "github.repos.delete",
          inputPreviewJson: "{}",
          defaultMode: "auto",
          requireApprovals: true,
          retryAfterMs: 333,
        }),
      )) as {
        kind: "approved" | "pending" | "denied";
      };

      expect(resolvedDecision).toEqual({
        kind: "approved",
      });
    }),
  );
});
