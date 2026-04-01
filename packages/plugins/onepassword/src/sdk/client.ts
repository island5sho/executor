import { Effect } from "effect";
import {
  createClient,
  DesktopAuth,
  type Client,
} from "@1password/sdk";

import { OnePasswordError } from "./errors";

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;

export const withTimeout = <T>(
  operation: string,
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new OnePasswordError({
            operation,
            message: `timed out after ${Math.floor(timeoutMs / 1000)}s — approve the request in the 1Password desktop app and try again`,
          }),
        ),
      timeoutMs,
    );
    fn().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });

// ---------------------------------------------------------------------------
// Resolved auth — raw credentials ready for the SDK
// ---------------------------------------------------------------------------

export type ResolvedAuth =
  | { readonly kind: "desktop-app"; readonly accountName: string }
  | { readonly kind: "service-account"; readonly token: string };

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export const make1PClient = (
  auth: ResolvedAuth,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Effect.Effect<Client, OnePasswordError> =>
  Effect.tryPromise({
    try: () =>
      withTimeout(
        "client setup",
        () =>
          createClient({
            auth:
              auth.kind === "desktop-app"
                ? new DesktopAuth(auth.accountName)
                : auth.token,
            integrationName: "Executor",
            integrationVersion: "0.0.0",
          }),
        timeoutMs,
      ),
    catch: (cause) =>
      new OnePasswordError({
        operation: "client setup",
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });
