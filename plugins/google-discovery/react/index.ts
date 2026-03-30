import {
  defineExecutorFrontendPlugin,
  liveFrontendPluginComponent,
} from "@executor/react/plugins";

import {
  GOOGLE_DISCOVERY_PLUGIN_KEY,
} from "@executor/plugin-google-discovery-shared";

import {
  GoogleDiscoveryAddPage,
  GoogleDiscoveryDetailRoute,
  GoogleDiscoveryEditRoute,
} from "./components";
export {
  getGoogleDiscoveryIconUrl,
  getGoogleDiscoveryIconUrlForService,
} from "./icons";

export const GoogleDiscoveryReactPlugin = defineExecutorFrontendPlugin({
  key: GOOGLE_DISCOVERY_PLUGIN_KEY,
  displayName: "Google Discovery",
  description: "Connect Google Workspace and Cloud APIs via discovery documents.",
  routes: [
    {
      key: "add",
      path: "add",
      component: liveFrontendPluginComponent(() => GoogleDiscoveryAddPage),
    },
    {
      key: "detail",
      path: "sources/$sourceId",
      component: liveFrontendPluginComponent(() => GoogleDiscoveryDetailRoute),
    },
    {
      key: "edit",
      path: "sources/$sourceId/edit",
      component: liveFrontendPluginComponent(() => GoogleDiscoveryEditRoute),
    },
  ],
});
