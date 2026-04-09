// ---------------------------------------------------------------------------
// HTTP API middleware — session and organization authorization
// ---------------------------------------------------------------------------

import { Context, Effect, Layer, Redacted, Schema } from "effect";
import {
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  HttpServerRequest,
} from "@effect/platform";

import { WorkOSAuth } from "./workos";

// ---------------------------------------------------------------------------
// Session — what every authenticated request gets
// ---------------------------------------------------------------------------

export type Session = {
  readonly accountId: string;
  readonly email: string;
  readonly name: string | null;
  readonly avatarUrl: string | null;
  /** May be null if the user hasn't joined an organization yet. */
  readonly organizationId: string | null;
  readonly refreshedSession: string | null;
};

export class SessionContext extends Context.Tag("@executor/cloud/Session")<
  SessionContext,
  Session
>() {}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class NoOrganization extends Schema.TaggedError<NoOrganization>()(
  "NoOrganization",
  {},
  HttpApiSchema.annotations({ status: 403 }),
) {}

// ---------------------------------------------------------------------------
// SessionAuth middleware — resolves the WorkOS session cookie
// ---------------------------------------------------------------------------

export class SessionAuth extends HttpApiMiddleware.Tag<SessionAuth>()(
  "SessionAuth",
  {
    failure: Unauthorized,
    provides: SessionContext,
    security: {
      cookie: HttpApiSecurity.apiKey({
        in: "cookie",
        key: "wos-session",
      }),
    },
  },
) {}

export const SessionAuthLive = Layer.effect(
  SessionAuth,
  Effect.gen(function* () {
    const workos = yield* WorkOSAuth;
    return SessionAuth.of({
      cookie: (sealedSession) =>
        Effect.gen(function* () {
          const result = yield* workos
            .authenticateSealedSession(Redacted.value(sealedSession))
            .pipe(Effect.orElseSucceed(() => null));

          if (!result) {
            return yield* new Unauthorized();
          }

          return {
            accountId: result.userId,
            email: result.email,
            name:
              `${result.firstName ?? ""} ${result.lastName ?? ""}`.trim() ||
              null,
            avatarUrl: result.avatarUrl ?? null,
            organizationId: result.organizationId ?? null,
            refreshedSession: result.refreshedSession ?? null,
          };
        }),
    });
  }),
);

// ---------------------------------------------------------------------------
// OrgRequired middleware — requires an organization in the session
// ---------------------------------------------------------------------------

export class AuthContext extends Context.Tag("@executor/cloud/AuthContext")<
  AuthContext,
  {
    readonly accountId: string;
    readonly organizationId: string;
    readonly email: string;
    readonly name: string | null;
    readonly avatarUrl: string | null;
  }
>() {}

export class OrgAuth extends HttpApiMiddleware.Tag<OrgAuth>()("OrgAuth", {
  failure: Schema.Union(Unauthorized, NoOrganization),
  provides: AuthContext,
  security: {
    cookie: HttpApiSecurity.apiKey({
      in: "cookie",
      key: "wos-session",
    }),
  },
}) {}

export const OrgAuthLive = Layer.effect(
  OrgAuth,
  Effect.gen(function* () {
    const workos = yield* WorkOSAuth;
    return OrgAuth.of({
      cookie: (sealedSession) =>
        Effect.gen(function* () {
          const result = yield* workos
            .authenticateSealedSession(Redacted.value(sealedSession))
            .pipe(Effect.orElseSucceed(() => null));

          if (!result) {
            return yield* new Unauthorized();
          }

          if (!result.organizationId) {
            return yield* new NoOrganization();
          }

          return {
            accountId: result.userId,
            organizationId: result.organizationId,
            email: result.email,
            name:
              `${result.firstName ?? ""} ${result.lastName ?? ""}`.trim() ||
              null,
            avatarUrl: result.avatarUrl ?? null,
          };
        }),
    });
  }),
);
