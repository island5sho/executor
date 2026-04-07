import { createMiddleware, createStart } from "@tanstack/react-start";
import { handleApiRequest, handleMcpRequest } from "./server/api-handler";

const serverRequestMiddleware = createMiddleware({ type: "request" }).server(
  ({ pathname, request, next }) => {
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return handleApiRequest(request);
    }
    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      return handleMcpRequest(request);
    }
    return next();
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [serverRequestMiddleware],
}));
