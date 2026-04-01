import { HttpApi, OpenApi } from "@effect/platform";

import { ToolsApi } from "./tools/api";
import { SecretsApi } from "./secrets/api";

export const ExecutorApi = HttpApi.make("executor")
  .add(ToolsApi)
  .add(SecretsApi)
  .annotateContext(
    OpenApi.annotations({
      title: "Executor API",
      description: "Tool execution platform API",
    }),
  );
