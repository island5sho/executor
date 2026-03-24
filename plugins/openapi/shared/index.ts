import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import YAML from "yaml";

import {
  StringMapSchema,
} from "@executor/source-core";

export const OpenApiConnectionAuthSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("none"),
  }),
  Schema.Struct({
    kind: Schema.Literal("bearer"),
    tokenSecretRef: Schema.String,
  }),
);

export const OpenApiConnectInputSchema = Schema.Struct({
  name: Schema.String,
  specUrl: Schema.String,
  baseUrl: Schema.NullOr(Schema.String),
  auth: OpenApiConnectionAuthSchema,
});

export const OpenApiSourceConfigSchema = Schema.Struct({
  specUrl: Schema.String,
  baseUrl: Schema.NullOr(Schema.String),
  authStrategy: Schema.Literal("none", "bearer"),
  documentHash: Schema.String,
});

export const OpenApiStoredSourceDataSchema = Schema.Struct({
  specUrl: Schema.String,
  baseUrl: Schema.NullOr(Schema.String),
  auth: OpenApiConnectionAuthSchema,
  defaultHeaders: Schema.NullOr(StringMapSchema),
  etag: Schema.NullOr(Schema.String),
  lastSyncAt: Schema.NullOr(Schema.Number),
});

export const OpenApiPreviewRequestSchema = Schema.Struct({
  specUrl: Schema.String,
});

export const OpenApiPreviewResponseSchema = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  version: Schema.NullOr(Schema.String),
  baseUrl: Schema.NullOr(Schema.String),
  operationCount: Schema.Number,
  warnings: Schema.Array(Schema.String),
});

export type OpenApiConnectionAuth = typeof OpenApiConnectionAuthSchema.Type;
export type OpenApiConnectInput = typeof OpenApiConnectInputSchema.Type;
export type OpenApiSourceConfig = typeof OpenApiSourceConfigSchema.Type;
export type OpenApiStoredSourceData = typeof OpenApiStoredSourceDataSchema.Type;
export type OpenApiPreviewRequest = typeof OpenApiPreviewRequestSchema.Type;
export type OpenApiPreviewResponse = typeof OpenApiPreviewResponseSchema.Type;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const parseDocument = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("The OpenAPI document is empty.");
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  return YAML.parse(trimmed);
};

const deriveBaseUrl = (document: JsonRecord, specUrl: string): string | null => {
  const servers = Array.isArray(document.servers) ? document.servers : [];
  const firstServer = asRecord(servers[0]);
  const rawUrl = asString(firstServer?.url);
  if (rawUrl === null) {
    return null;
  }

  try {
    return new URL(rawUrl, specUrl).toString();
  } catch {
    return rawUrl;
  }
};

const countOperations = (document: JsonRecord): number => {
  const paths = asRecord(document.paths);
  if (paths === null) {
    return 0;
  }

  const methodNames = new Set([
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "trace",
  ]);

  let count = 0;
  for (const pathItem of Object.values(paths)) {
    const pathRecord = asRecord(pathItem);
    if (pathRecord === null) {
      continue;
    }

    for (const key of Object.keys(pathRecord)) {
      if (methodNames.has(key.toLowerCase())) {
        count += 1;
      }
    }
  }

  return count;
};

export const previewOpenApiDocument = async (
  input: OpenApiPreviewRequest,
): Promise<OpenApiPreviewResponse> => {
  const response = await fetch(input.specUrl);
  if (!response.ok) {
    throw new Error(`Failed fetching spec: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const parsed = parseDocument(text);
  const document = asRecord(parsed);
  if (document === null) {
    throw new Error("The fetched document is not a valid OpenAPI object.");
  }

  const info = asRecord(document.info);
  const warnings: string[] = [];

  const openapiVersion = asString(document.openapi) ?? asString(document.swagger);
  if (openapiVersion === null) {
    warnings.push("The document does not declare an OpenAPI/Swagger version.");
  }

  const baseUrl = deriveBaseUrl(document, input.specUrl);
  if (baseUrl === null) {
    warnings.push("No server URL was found in the document.");
  }

  return {
    title: asString(info?.title),
    version: asString(info?.version),
    baseUrl,
    operationCount: countOperations(document),
    warnings,
  };
};

export const decodeOpenApiStoredSourceData = (
  value: unknown,
): Effect.Effect<OpenApiStoredSourceData, Error, never> =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(OpenApiStoredSourceDataSchema)(value),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });
