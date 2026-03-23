import { describe, expect, it } from "@effect/vitest";

import {
  appendUrlPath,
  renderMcpSessionSummary,
  renderUpSummary,
  renderWebSessionSummary,
} from "./session-summary";

describe("session-summary", () => {
  it("appends paths against a base url", () => {
    expect(appendUrlPath("http://127.0.0.1:8788", "mcp")).toBe("http://127.0.0.1:8788/mcp");
    expect(appendUrlPath("http://127.0.0.1:8788/", "v1/openapi.json")).toBe(
      "http://127.0.0.1:8788/v1/openapi.json",
    );
  });

  it("renders the web session summary around the browser url", () => {
    const output = renderWebSessionSummary({
      baseUrl: "http://127.0.0.1:8788",
      workspaceId: "ws_123",
    });

    expect(output).toContain("Executor web session is ready.");
    expect(output).toContain("Web: http://127.0.0.1:8788");
    expect(output).toContain("MCP: http://127.0.0.1:8788/mcp");
    expect(output).toContain("Workspace: ws_123");
    expect(output).toContain("Press Ctrl+C to stop this session.");
  });

  it("renders the MCP session summary around the MCP url", () => {
    const output = renderMcpSessionSummary({
      baseUrl: "http://127.0.0.1:8788",
      workspaceId: "ws_456",
    });

    expect(output).toContain("Executor MCP session is ready.");
    expect(output).toContain("MCP: http://127.0.0.1:8788/mcp");
    expect(output).toContain("Web: http://127.0.0.1:8788");
    expect(output).toContain("Workspace: ws_456");
    expect(output).toContain("Use this MCP URL in your client and keep this process running.");
  });

  it("adds session-first next steps to the up summary", () => {
    const output = renderUpSummary({
      started: true,
      status: {
        baseUrl: "http://127.0.0.1:8788",
        installation: {
          workspaceId: "ws_789",
        },
      },
    });

    expect(output).toContain("Executor is ready.");
    expect(output).toContain("executor web");
    expect(output).toContain("executor mcp");
    expect(output).toContain("executor call 'return 1 + 1'");
  });
});
