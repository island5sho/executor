// ---------------------------------------------------------------------------
// Session management — cookie-based sessions backed by Postgres
// ---------------------------------------------------------------------------

import type { makeUserStore } from "@executor/storage-postgres";

export type UserStore = ReturnType<typeof makeUserStore>;

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE_NAME = "executor_session";

export const createSession = async (
  userStore: UserStore,
  userId: string,
  teamId: string,
) => {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  return userStore.createSession(userId, teamId, expiresAt);
};

export const validateSession = async (
  userStore: UserStore,
  sessionId: string,
) => {
  return userStore.getSession(sessionId);
};

export const deleteSession = async (
  userStore: UserStore,
  sessionId: string,
) => {
  await userStore.deleteSession(sessionId);
};

export const makeSessionCookie = (
  sessionId: string,
  domain?: string,
): string => {
  const parts = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DURATION_MS / 1000}`,
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
};

export const clearSessionCookie = (domain?: string): string => {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
};

export const parseSessionId = (cookieHeader: string | null): string | null => {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!match) return null;
  return match.split("=")[1] ?? null;
};
