import { handleApiRequest as _handleApiRequest } from "../api";

export const handleApiRequest = (request: Request) => {
  // Strip /api prefix — Start request middleware forwards /api/* here,
  // but Effect endpoints are defined without the prefix.
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api/, "");
  return _handleApiRequest(new Request(url, request));
};
