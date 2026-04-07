// ---------------------------------------------------------------------------
// Team handlers — members, invitations
// ---------------------------------------------------------------------------

import { makeUserStore } from "@executor/storage-postgres";
import { parseSessionId, validateSession } from "../auth/session";
import type { DrizzleDb } from "../services/db";

export const createTeamHandlers = (db: DrizzleDb) => {
  const userStore = makeUserStore(db);

  const requireAuth = async (request: Request) => {
    const sessionId = parseSessionId(request.headers.get("cookie"));
    if (!sessionId) return null;
    const session = await validateSession(userStore, sessionId);
    if (!session) return null;
    return session;
  };

  return {
    listMembers: async (request: Request): Promise<Response> => {
      const session = await requireAuth(request);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const members = await userStore.listMembers(session.teamId);
      return Response.json({ members });
    },

    invite: async (request: Request): Promise<Response> => {
      const session = await requireAuth(request);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const body = await request.json() as { email: string };
      if (!body.email) {
        return Response.json({ error: "Email required" }, { status: 400 });
      }

      const invitation = await userStore.createInvitation(
        session.teamId,
        body.email,
        session.userId,
      );
      return Response.json({ invitation });
    },

    listInvitations: async (request: Request): Promise<Response> => {
      const session = await requireAuth(request);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const invitations = await userStore.getTeamInvitations(session.teamId);
      return Response.json({ invitations });
    },

    removeMember: async (request: Request): Promise<Response> => {
      const session = await requireAuth(request);
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const body = await request.json() as { userId: string };
      if (!body.userId) {
        return Response.json({ error: "userId required" }, { status: 400 });
      }

      // Can't remove yourself
      if (body.userId === session.userId) {
        return Response.json({ error: "Cannot remove yourself" }, { status: 400 });
      }

      await userStore.removeMember(session.teamId, body.userId);
      return Response.json({ removed: true });
    },
  };
};
