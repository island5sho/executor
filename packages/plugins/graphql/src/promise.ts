import { graphqlPlugin as _graphqlPlugin } from "./sdk/plugin";

export type { GraphqlSourceConfig } from "./sdk/plugin";
export type { HeaderValue } from "./sdk/types";

export const graphqlPlugin = (options?: {}) => _graphqlPlugin(options);
