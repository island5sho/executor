import {
  defineExecutorFrontendPlugin,
  liveFrontendPluginComponent,
} from "@executor/react/plugins";

import {
  McpAddPage,
  McpDetailRoute,
  McpEditRoute,
} from "./components";

export const McpReactPlugin = defineExecutorFrontendPlugin({
  key: "mcp",
  displayName: "MCP",
  description: "Connect remote or local MCP servers.",
  routes: [
    {
      key: "add",
      path: "add",
      component: liveFrontendPluginComponent(() => McpAddPage),
    },
    {
      key: "detail",
      path: "sources/$sourceId",
      component: liveFrontendPluginComponent(() => McpDetailRoute),
    },
    {
      key: "edit",
      path: "sources/$sourceId/edit",
      component: liveFrontendPluginComponent(() => McpEditRoute),
    },
  ],
});
