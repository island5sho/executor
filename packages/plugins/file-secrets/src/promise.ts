import { fileSecretsPlugin as _fileSecretsPlugin } from "./index";

export type { FileSecretsPluginConfig } from "./index";

export const fileSecretsPlugin = (
  config?: { readonly directory?: string },
) => _fileSecretsPlugin(config);
