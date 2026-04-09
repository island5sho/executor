import { HttpApi, HttpApiBuilder, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { setCookie, deleteCookie, getCookie } from "@tanstack/react-start/server";

import { AUTH_PATHS, CloudAuthPublicApi } from "./api";
import { CloudAuthApi } from "./api";
import { SessionContext } from "./middleware";
import { UserStoreService } from "./context";
import { WorkOSAuth } from "./workos";
import { server } from "../env";

const COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
  secure: server.NODE_ENV === "production",
};

// ---------------------------------------------------------------------------
// Public auth handlers (no authentication required)
// ---------------------------------------------------------------------------

const PublicAuthApi = HttpApi.make("cloudPublic").add(CloudAuthPublicApi);

export const CloudAuthPublicHandlers = HttpApiBuilder.group(
  PublicAuthApi,
  "cloudAuthPublic",
  (handlers) =>
    handlers
      .handleRaw("login", () =>
        Effect.gen(function* () {
          const workos = yield* WorkOSAuth;
          const req = yield* HttpServerRequest.HttpServerRequest;
          const proto = req.headers["x-forwarded-proto"] ?? "https";
          const origin = new URL(req.url, `${proto}://${req.headers["host"]}`).origin;
          const url = workos.getAuthorizationUrl(`${origin}${AUTH_PATHS.callback}`);
          return HttpServerResponse.redirect(url, { status: 302 });
        }),
      )
      .handleRaw("callback", ({ urlParams }) =>
        Effect.gen(function* () {
          const workos = yield* WorkOSAuth;
          const users = yield* UserStoreService;

          const result = yield* workos.authenticateWithCode(urlParams.code);

          // Mirror the account locally (foreign-key anchor only — no profile data)
          yield* users.use((s) => s.ensureAccount(result.user.id));

          // Mirror the org if WorkOS returned one
          if (result.organizationId) {
            yield* users.use((s) =>
              s.upsertOrganization({
                id: result.organizationId!,
                name: "Organization",
              }),
            );
          }

          const sealedSession = result.sealedSession;
          if (!sealedSession) {
            return HttpServerResponse.text("Failed to create session", { status: 500 });
          }

          setCookie("wos-session", sealedSession, COOKIE_OPTIONS);

          // If no org yet, send the user to the setup flow.
          const redirectTo = result.organizationId ? "/" : "/setup";
          return HttpServerResponse.redirect(redirectTo, { status: 302 });
        }),
      ),
);

// ---------------------------------------------------------------------------
// Session auth handlers (require session, may or may not have an org)
// ---------------------------------------------------------------------------

const SessionAuthApiSurface = HttpApi.make("cloudSession").add(CloudAuthApi);

export const CloudSessionAuthHandlers = HttpApiBuilder.group(
  SessionAuthApiSurface,
  "cloudAuth",
  (handlers) =>
    handlers
      .handle("me", () =>
        Effect.gen(function* () {
          const session = yield* SessionContext;
          const users = yield* UserStoreService;
          const org = session.organizationId
            ? yield* users.use((s) => s.getOrganization(session.organizationId!))
            : null;

          return {
            user: {
              id: session.accountId,
              email: session.email,
              name: session.name,
              avatarUrl: session.avatarUrl,
            },
            organization: org ? { id: org.id, name: org.name } : null,
          };
        }),
      )
      .handleRaw("logout", () =>
        Effect.sync(() => {
          deleteCookie("wos-session", { path: "/" });
          return HttpServerResponse.redirect("/", { status: 302 });
        }),
      )
      .handle("createOrganization", ({ payload }) =>
        Effect.gen(function* () {
          const session = yield* SessionContext;
          const workos = yield* WorkOSAuth;
          const users = yield* UserStoreService;

          // Create the org in WorkOS
          const org = yield* workos.createOrganization(payload.name);

          // Add the current user as a member
          yield* workos.createMembership(org.id, session.accountId);

          // Mirror locally
          yield* users.use((s) =>
            s.upsertOrganization({ id: org.id, name: org.name }),
          );

          // Refresh the session with the new org context
          const currentSession = getCookie("wos-session") ?? null;
          if (currentSession) {
            const newSession = yield* workos.refreshSession(currentSession, org.id);
            if (newSession) {
              setCookie("wos-session", newSession, COOKIE_OPTIONS);
            }
          }
        }),
      ),
);
