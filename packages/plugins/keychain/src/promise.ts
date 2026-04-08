import { keychainPlugin as _keychainPlugin } from "./index";

export type { KeychainPluginConfig } from "./index";

export const keychainPlugin = (
  config?: { readonly serviceName?: string },
) => _keychainPlugin(config);
