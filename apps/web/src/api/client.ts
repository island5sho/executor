import { AtomHttpApi } from "@effect-atom/atom-react";
import { FetchHttpClient } from "@effect/platform";
import { ExecutorApi } from "@executor/api";

// ---------------------------------------------------------------------------
// Typed HTTP API client — uses effect-atom's AtomHttpApi.Tag
// ---------------------------------------------------------------------------

class ExecutorClient extends AtomHttpApi.Tag<ExecutorClient>()("ExecutorClient", {
  api: ExecutorApi,
  httpClient: FetchHttpClient.layer,
  baseUrl: "/",
}) {}

export { ExecutorClient };
