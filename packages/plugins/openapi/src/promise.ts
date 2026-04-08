import { openApiPlugin as _openApiPlugin } from "./sdk/plugin";

export type { OpenApiSpecConfig } from "./sdk/plugin";

export const openApiPlugin = (options?: {}) => _openApiPlugin(options);
