// ---------------------------------------------------------------------------
// WorkOS AuthKit integration
// ---------------------------------------------------------------------------

import { WorkOS } from "@workos-inc/node";

let workos: WorkOS | null = null;

export const getWorkOS = (): WorkOS => {
  if (!workos) {
    workos = new WorkOS(process.env.WORKOS_API_KEY!);
  }
  return workos;
};

export const getAuthorizationUrl = (redirectUri: string): string => {
  const wos = getWorkOS();
  return wos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    redirectUri,
    clientId: process.env.WORKOS_CLIENT_ID!,
  });
};

export const authenticateWithCode = async (code: string) => {
  const wos = getWorkOS();
  return wos.userManagement.authenticateWithCode({
    code,
    clientId: process.env.WORKOS_CLIENT_ID!,
  });
};
