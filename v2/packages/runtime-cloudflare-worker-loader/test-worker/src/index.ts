const AUTH_TOKEN = "sandbox-token";

type CloudflareRunRequest = {
  runId?: unknown;
  taskId?: unknown;
  code?: unknown;
  timeoutMs?: unknown;
  callback?: {
    url?: unknown;
    internalSecret?: unknown;
  };
};

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidRunRequest = (value: unknown): value is CloudflareRunRequest => {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (typeof value.runId !== "string") {
    return false;
  }

  if (typeof value.taskId !== "string") {
    return false;
  }

  if (typeof value.code !== "string") {
    return false;
  }

  if (!isObjectRecord(value.callback)) {
    return false;
  }

  if (typeof value.callback.url !== "string") {
    return false;
  }

  if (
    value.callback.internalSecret !== undefined &&
    typeof value.callback.internalSecret !== "string"
  ) {
    return false;
  }

  return true;
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    if (url.pathname !== "/v1/runs" || request.method !== "POST") {
      return json({ error: "not_found" }, 404);
    }

    if (request.headers.get("authorization") !== `Bearer ${AUTH_TOKEN}`) {
      return json({ error: "unauthorized" }, 401);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (!isValidRunRequest(payload)) {
      return json({ error: "invalid_payload" }, 400);
    }

    const scenario = url.searchParams.get("scenario") ?? "completed";

    if (scenario === "http-500") {
      return json({ error: "host_failure" }, 500);
    }

    if (scenario === "invalid-json") {
      return new Response("{bad-json", {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    if (scenario === "failed") {
      return json({ status: "failed", error: "tool call denied" }, 200);
    }

    return json(
      {
        status: "completed",
        result: {
          echoedRunId: payload.runId,
          callback: payload.callback,
        },
        exitCode: 0,
      },
      200,
    );
  },
};
