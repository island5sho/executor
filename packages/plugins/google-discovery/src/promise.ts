import { googleDiscoveryPlugin as _googleDiscoveryPlugin } from "./sdk/plugin";

export type {
  GoogleDiscoveryAddSourceInput,
  GoogleDiscoveryProbeResult,
  GoogleDiscoveryOAuthStartInput,
  GoogleDiscoveryOAuthStartResponse,
  GoogleDiscoveryOAuthCompleteInput,
  GoogleDiscoveryOAuthAuthResult,
} from "./sdk/plugin";

export const googleDiscoveryPlugin = (options?: {}) =>
  _googleDiscoveryPlugin(options);
