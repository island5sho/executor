import { openApiPlugin as _openApiPlugin } from "./sdk/plugin";

export type { OpenApiSpecConfig } from "./sdk/plugin";
export type { OpenApiOperationStore } from "./sdk/operation-store";

export interface OpenApiPluginOptions {
  readonly operationStore?: import("./sdk/operation-store").OpenApiOperationStore;
}

export const openApiPlugin = (options?: OpenApiPluginOptions) =>
  _openApiPlugin(options);
