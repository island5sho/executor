import { defineRule } from "@oxlint/plugins";

import {
  isRuntimeOrPluginImplementationFile,
} from "../workspace-utils.mjs";

const readTypeArguments = (node) =>
  node?.typeParameters?.params ?? node?.typeArguments?.params ?? [];

const isIdentifierNamed = (node, name) =>
  node?.type === "Identifier" && node.name === name;

const isEffectTypeName = (node) =>
  node?.type === "TSQualifiedName"
  && isIdentifierNamed(node.left, "Effect")
  && isIdentifierNamed(node.right, "Effect");

const isEffectTypeReference = (node) =>
  node?.type === "TSTypeReference"
  && isEffectTypeName(node.typeName);

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow widening Effect environments to any in runtime and plugin implementation files.",
      recommended: true,
    },
    messages: {
      noEffectEnvAny:
        "Do not widen an Effect environment to `any` in runtime or plugin implementation code. Keep the environment generic or provide the missing services explicitly.",
    },
  },
  create(context) {
    if (!isRuntimeOrPluginImplementationFile(context.filename)) {
      return {};
    }

    return {
      TSTypeReference(node) {
        if (!isEffectTypeReference(node)) {
          return;
        }

        const typeArguments = readTypeArguments(node);
        if (typeArguments.length < 3 || typeArguments[2]?.type !== "TSAnyKeyword") {
          return;
        }

        context.report({
          node: typeArguments[2],
          messageId: "noEffectEnvAny",
        });
      },
    };
  },
});
