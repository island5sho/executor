// ---------------------------------------------------------------------------
// Auth handlers — login, callback, logout, me
// ---------------------------------------------------------------------------

import { makeUserStore } from "@executor/storage-postgres";
import { getAuthorizationUrl, authenticateWithCode } from "../auth/workos";
import {
  createSession,
  parseSessionId,
  validateSession,
  makeSessionCookie,
  clearSessionCookie,
  type UserStore,
} from "../auth/session";
import type { DrizzleDb } from "../services/db";

export const createAuthHandlers = (db: DrizzleDb) => {
  const userStore = makeUserStore(db);

  const getBaseUrl = (): string => {
    if (process.env.APP_URL) return process.env.APP_URL;
    const port = process.env.PORT ?? "3000";
    return `http://localhost:${port}`;
  };

  return {
    login: async (_request: Request): Promise<Response> => {
      const redirectUri = `${getBaseUrl()}/auth/callback`;
      const url = getAuthorizationUrl(redirectUri);
      return Response.redirect(url, 302);
    },

    callback: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code parameter", { status: 400 });
      }

      try {
        const result = await authenticateWithCode(code);
        const workosUser = result.user;

        // Upsert user
        const user = await userStore.upsertUser({
          id: workosUser.id,
          email: workosUser.email,
          name: `${workosUser.firstName ?? ""} ${workosUser.lastName ?? ""}`.trim() || undefined,
          avatarUrl: workosUser.profilePictureUrl ?? undefined,
        });

        // Check for pending invitations
        const pendingInvitations = await userStore.getPendingInvitations(user.email);
        let teamId: string;

        if (pendingInvitations.length > 0) {
          // Accept first pending invitation
          const invitation = pendingInvitations[0]!;
          await userStore.acceptInvitation(invitation.id);
          await userStore.addMember(invitation.teamId, user.id, "member");
          teamId = invitation.teamId;
        } else {
          // Check existing teams
          const teams = await userStore.getTeamsForUser(user.id);
          if (teams.length > 0) {
            teamId = teams[0]!.teamId;
          } else {
            // Create a new team for first-time users
            const team = await userStore.createTeam(`${user.name ?? user.email}'s Team`);
            await userStore.addMember(team.id, user.id, "owner");
            teamId = team.id;
          }
        }

        // Create session
        const session = await createSession(userStore, user.id, teamId);

        return new Response(null, {
          status: 302,
          headers: {
            Location: "/",
            "Set-Cookie": makeSessionCookie(session.id),
          },
        });
      } catch (error) {
        console.error("Auth callback error:", error);
        return new Response("Authentication failed", { status: 500 });
      }
    },

    logout: async (request: Request): Promise<Response> => {
      const sessionId = parseSessionId(request.headers.get("cookie"));
      if (sessionId) {
        await userStore.deleteSession(sessionId);
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/login",
          "Set-Cookie": clearSessionCookie(),
        },
      });
    },

    me: async (request: Request): Promise<Response> => {
      const sessionId = parseSessionId(request.headers.get("cookie"));
      if (!sessionId) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }

      const session = await validateSession(userStore, sessionId);
      if (!session) {
        return Response.json({ error: "Invalid session" }, { status: 401 });
      }

      const user = await userStore.getUser(session.userId);
      if (!user) {
        return Response.json({ error: "User not found" }, { status: 401 });
      }

      const team = await userStore.getTeam(session.teamId);

      return Response.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        team: team ? { id: team.id, name: team.name } : null,
      });
    },
  };
};
