import { ScopeId, ToolId, SecretId } from "@executor/sdk";
import { ExecutorClient } from "./client";

// ---------------------------------------------------------------------------
// Query atoms — typed, cached, reactive
// ---------------------------------------------------------------------------

export const toolsAtom = (scopeId: ScopeId = ScopeId.make("default")) =>
  ExecutorClient.query("tools", "list", {
    path: { scopeId },
    timeToLive: "30 seconds",
  });

export const toolSchemaAtom = (scopeId: ScopeId, toolId: ToolId) =>
  ExecutorClient.query("tools", "schema", {
    path: { scopeId, toolId },
    timeToLive: "1 minute",
  });

export const secretsAtom = (scopeId: ScopeId = ScopeId.make("default")) =>
  ExecutorClient.query("secrets", "list", {
    path: { scopeId },
    timeToLive: "30 seconds",
  });

export const secretStatusAtom = (scopeId: ScopeId, secretId: SecretId) =>
  ExecutorClient.query("secrets", "status", {
    path: { scopeId, secretId },
    timeToLive: "15 seconds",
  });

// ---------------------------------------------------------------------------
// Mutation atoms — fire-and-forget style
// ---------------------------------------------------------------------------

export const invokeTool = ExecutorClient.mutation("tools", "invoke");

export const setSecret = ExecutorClient.mutation("secrets", "set");

export const removeSecret = ExecutorClient.mutation("secrets", "remove");
