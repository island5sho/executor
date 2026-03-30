import {
  defineExecutorFrontendPlugin,
  liveFrontendPluginComponent,
} from "@executor/react/plugins";

import {
  ExecutionHistoryDetailPage,
  ExecutionHistoryPage,
} from "./components";

export const ExecutionHistoryReactPlugin = defineExecutorFrontendPlugin({
  key: "execution-history",
  displayName: "Execution History",
  description: "Browse previous executions for this workspace.",
  routes: [
    {
      key: "history",
      component: liveFrontendPluginComponent(() => ExecutionHistoryPage),
      nav: {
        label: "Runs",
        section: "main",
      },
    },
    {
      key: "detail",
      path: "$executionId",
      component: liveFrontendPluginComponent(() => ExecutionHistoryDetailPage),
    },
  ],
});
