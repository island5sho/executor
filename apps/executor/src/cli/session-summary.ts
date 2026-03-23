export const appendUrlPath = (baseUrl: string, pathname: string): string =>
  new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();

type SessionSummaryInput = {
  readonly baseUrl: string;
  readonly workspaceId?: string | null;
};

const renderSessionSummary = (
  kind: "web" | "mcp",
  input: SessionSummaryInput,
): string => {
  const displayKind = kind === "mcp" ? "MCP" : "web";
  const primaryLabel = kind === "web" ? "Web" : "MCP";
  const primaryUrl = kind === "web" ? input.baseUrl : appendUrlPath(input.baseUrl, "mcp");
  const secondaryLabel = kind === "web" ? "MCP" : "Web";
  const secondaryUrl = kind === "web" ? appendUrlPath(input.baseUrl, "mcp") : input.baseUrl;
  const guidance = kind === "web"
    ? "Keep this process running while you use the browser session."
    : "Use this MCP URL in your client and keep this process running.";

  return [
    `Executor ${displayKind} session is ready.`,
    `${primaryLabel}: ${primaryUrl}`,
    `${secondaryLabel}: ${secondaryUrl}`,
    `OpenAPI: ${appendUrlPath(input.baseUrl, "v1/openapi.json")}`,
    `Workspace: ${input.workspaceId ?? "unavailable"}`,
    "",
    guidance,
    "Press Ctrl+C to stop this session.",
  ].join("\n");
};

export const renderWebSessionSummary = (input: SessionSummaryInput): string =>
  renderSessionSummary("web", input);

export const renderMcpSessionSummary = (input: SessionSummaryInput): string =>
  renderSessionSummary("mcp", input);

type UpSummaryInput = {
  readonly started: boolean;
  readonly status: {
    readonly baseUrl: string;
    readonly installation: {
      readonly workspaceId: string;
    } | null;
  };
};

export const renderUpSummary = (input: UpSummaryInput): string =>
  [
    input.started ? "Executor is ready." : "Executor is already running.",
    `API: ${input.status.baseUrl}`,
    `MCP: ${appendUrlPath(input.status.baseUrl, "mcp")}`,
    `OpenAPI: ${appendUrlPath(input.status.baseUrl, "v1/openapi.json")}`,
    `Workspace: ${input.status.installation?.workspaceId ?? "unavailable"}`,
    "",
    "Try next:",
    "  executor web",
    "  executor mcp",
    "  executor call 'return 1 + 1'",
    "  executor status",
    "  executor down",
  ].join("\n");
