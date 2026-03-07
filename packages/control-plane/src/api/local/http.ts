import { HttpApiBuilder, HttpServerRequest } from "@effect/platform";
import * as Effect from "effect/Effect";
import {
  completeSourceAuthCallback,
  getLocalInstallation,
} from "../../runtime/local-operations";

import { ControlPlaneApi } from "../api";

export const ControlPlaneLocalLive = HttpApiBuilder.group(
  ControlPlaneApi,
  "local",
  (handlers) =>
    handlers
      .handle("installation", () =>
        getLocalInstallation(),
      )
      .handle("oauthCallback", () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const requestUrl = new URL(request.url, "http://127.0.0.1");

          const source = yield* completeSourceAuthCallback({
            state: requestUrl.searchParams.get("state") ?? "",
            code: requestUrl.searchParams.get("code"),
            error: requestUrl.searchParams.get("error"),
            errorDescription: requestUrl.searchParams.get("error_description"),
          });

          return `Source connected: ${source.id}. You can close this window.`;
        }),
      ),
);
