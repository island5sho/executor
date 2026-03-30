import {
  defineExecutorFrontendPlugin,
  liveFrontendPluginComponent,
} from "@executor/react/plugins";

import {
  OpenApiAddSourcePage,
  OpenApiDetailRoute,
  OpenApiEditRoute,
} from "./components";

export const OpenApiReactPlugin = defineExecutorFrontendPlugin({
  key: "openapi",
  displayName: "OpenAPI",
  routes: [
    {
      key: "add",
      path: "add",
      component: liveFrontendPluginComponent(() => OpenApiAddSourcePage),
    },
    {
      key: "detail",
      path: "sources/$sourceId",
      component: liveFrontendPluginComponent(() => OpenApiDetailRoute),
    },
    {
      key: "edit",
      path: "sources/$sourceId/edit",
      component: liveFrontendPluginComponent(() => OpenApiEditRoute),
    },
  ],
});
