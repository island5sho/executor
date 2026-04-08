import { mcpPlugin as _mcpPlugin } from "./sdk/plugin";

export type {
  McpSourceConfig,
  McpRemoteSourceConfig,
  McpStdioSourceConfig,
  McpProbeResult,
  McpOAuthStartInput,
  McpOAuthStartResponse,
  McpOAuthCompleteInput,
  McpOAuthCompleteResponse,
} from "./sdk/plugin";

export type { McpBindingStore } from "./sdk/binding-store";

export interface McpPluginOptions {
  readonly bindingStore?: import("./sdk/binding-store").McpBindingStore;
}

export const mcpPlugin = (options?: McpPluginOptions) => _mcpPlugin(options);
