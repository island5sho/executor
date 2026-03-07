import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  CreateExecutionPayloadSchema,
} from "./executions/api";
import {
  CreateOrganizationPayloadSchema,
  UpdateOrganizationPayloadSchema,
} from "./organizations/api";
import { CreatePolicyPayloadSchema } from "./policies/api";
import {
  CreateSourcePayloadSchema,
  UpdateSourcePayloadSchema,
} from "./sources/api";
import { CreateWorkspacePayloadSchema } from "./workspaces/api";

describe("control-plane payload schemas", () => {
  it("normalizes trimmed strings at decode time", () => {
    expect(
      Schema.decodeUnknownSync(CreateOrganizationPayloadSchema)({
        name: "  Acme  ",
        slug: "  acme  ",
      }),
    ).toEqual({
      name: "Acme",
      slug: "acme",
    });

    expect(
      Schema.decodeUnknownSync(CreateWorkspacePayloadSchema)({
        name: "  Primary  ",
      }),
    ).toEqual({
      name: "Primary",
    });

    expect(
      Schema.decodeUnknownSync(CreateSourcePayloadSchema)({
        name: "  Github  ",
        kind: "openapi",
        endpoint: "  https://api.github.com  ",
      }),
    ).toEqual({
      name: "Github",
      kind: "openapi",
      endpoint: "https://api.github.com",
    });

    expect(
      Schema.decodeUnknownSync(CreateExecutionPayloadSchema)({
        code: "  console.log('ok')  ",
      }),
    ).toEqual({
      code: "console.log('ok')",
    });

    expect(
      Schema.decodeUnknownSync(CreatePolicyPayloadSchema)({
        resourcePattern: "  source.github.*  ",
      }),
    ).toEqual({
        resourcePattern: "source.github.*",
    });
  });

  it("rejects blank strings for normalized string fields", () => {
    expect(() =>
      Schema.decodeUnknownSync(CreateOrganizationPayloadSchema)({
        name: "   ",
      })
    ).toThrow();

    expect(() =>
      Schema.decodeUnknownSync(UpdateOrganizationPayloadSchema)({
        name: "   ",
      })
    ).toThrow();

    expect(() =>
      Schema.decodeUnknownSync(UpdateSourcePayloadSchema)({
        endpoint: "   ",
      })
    ).toThrow();
  });
});
