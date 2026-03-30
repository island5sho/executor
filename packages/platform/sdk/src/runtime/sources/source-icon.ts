import {
  getFaviconUrlForRemoteUrl,
} from "@executor/source-core";

const trimOrNull = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const resolveSourceIconUrl = (input: {
  configuredIconUrl?: string | null;
  kind: string;
  config?: unknown;
}): string | null => {
  const configuredIconUrl = trimOrNull(input.configuredIconUrl);
  if (configuredIconUrl) {
    return configuredIconUrl;
  }

  if (!isRecord(input.config)) {
    return null;
  }

  const endpoint =
    input.kind === "mcp" || input.kind === "graphql"
      ? (typeof input.config.endpoint === "string"
          ? trimOrNull(input.config.endpoint)
          : null)
      : input.kind === "openapi"
        ? (typeof input.config.baseUrl === "string"
            ? trimOrNull(input.config.baseUrl)
            : null)
          ?? (typeof input.config.specUrl === "string"
              ? trimOrNull(input.config.specUrl)
              : null)
        : null;
  if (!endpoint) {
    return null;
  }

  return getFaviconUrlForRemoteUrl(endpoint);
};
