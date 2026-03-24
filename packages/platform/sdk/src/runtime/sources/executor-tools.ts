import type { ToolMap } from "@executor/codemode-core";
import { SourceSchema } from "#schema";

import {
  deriveSchemaJson,
  deriveSchemaTypeSignature,
} from "../catalog/schema-type-signature";
import type {
  InstallationStoreShape,
  SourceArtifactStoreShape,
  ScopeConfigStoreShape,
  ScopeStateStoreShape,
} from "../scope/storage";

export const EXECUTOR_SOURCES_ADD_INPUT_HINT =
  "Source plugins are not registered in this build.";

export const EXECUTOR_SOURCES_ADD_OUTPUT_SIGNATURE = deriveSchemaTypeSignature(
  SourceSchema,
  260,
);

export const EXECUTOR_SOURCES_ADD_INPUT_SCHEMA = {};

export const EXECUTOR_SOURCES_ADD_OUTPUT_SCHEMA = deriveSchemaJson(
  SourceSchema,
) ?? {};

export const EXECUTOR_SOURCES_ADD_HELP_LINES = [
  "Source plugins are not registered in this build.",
] as const;

export const buildExecutorSourcesAddDescription = (): string =>
  "Source plugins are not registered in this build.";

export const createExecutorToolMap = (input: {
  scopeId?: string;
  actorScopeId?: string;
  installationStore: InstallationStoreShape;
  scopeConfigStore: ScopeConfigStoreShape;
  scopeStateStore: ScopeStateStoreShape;
  sourceArtifactStore: SourceArtifactStoreShape;
  runtimeLocalScope?: unknown;
}): ToolMap => {
  void input;
  return {};
};
