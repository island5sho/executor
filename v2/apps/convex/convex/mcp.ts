import { handleMcpHttpRequest } from "@executor-v2/mcp-gateway";
import { createExecutorRunClient } from "@executor-v2/sdk";
import * as Effect from "effect/Effect";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { executeRunImpl } from "./executor";
import { createConvexSourceToolRegistry } from "./source_tool_registry";

const readConfiguredWorkspaceId = (value: string | undefined): string => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "ws_local";
};

const workspaceId = readConfiguredWorkspaceId(process.env.CONVEX_WORKSPACE_ID);
const runtimeInternal = internal as any;

export const mcpHandler = httpAction(async (ctx, request) => {
  const toolRegistry = createConvexSourceToolRegistry(ctx, workspaceId);

  const runClient = createExecutorRunClient(async (input) => {
    const runId = `run_${crypto.randomUUID()}`;

    await ctx.runMutation(runtimeInternal.task_runs.startTaskRun, {
      workspaceId,
      runId,
      sessionId: "session_mcp",
      runtimeId: "runtime_local_inproc",
      codeHash: `code_length_${input.code.length}`,
    });

    try {
      const result = await Effect.runPromise(
        executeRunImpl(input, {
          toolRegistry,
          makeRunId: () => runId,
        }),
      );

      await ctx.runMutation(runtimeInternal.task_runs.finishTaskRun, {
        workspaceId,
        runId,
        status: result.status,
        error: result.error ?? null,
      });

      return result;
    } catch (cause) {
      await ctx.runMutation(runtimeInternal.task_runs.finishTaskRun, {
        workspaceId,
        runId,
        status: "failed",
        error: String(cause),
      });
      throw cause;
    }
  });

  return handleMcpHttpRequest(request, {
    serverName: "executor-v2-convex",
    serverVersion: "0.0.0",
    runClient,
  });
});
