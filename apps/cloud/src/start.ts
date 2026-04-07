import { createMiddleware, createStart } from "@tanstack/react-start";
import { handleApiRequest } from "./server/api-handler";

const apiRequestMiddleware = createMiddleware({ type: "request" }).server(
  ({ pathname, request, next }) => {
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return handleApiRequest(request);
    }
    return next();
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [apiRequestMiddleware],
}));
