import { lazy } from "react";
import type { SourcePlugin } from "@executor/react";

export const googleDiscoverySourcePlugin: SourcePlugin = {
  key: "googleDiscovery",
  label: "Google Discovery",
  add: lazy(() => import("./AddGoogleDiscoverySource")),
  edit: lazy(() => import("./EditGoogleDiscoverySource")),
  summary: lazy(() => import("./GoogleDiscoverySourceSummary")),
};
