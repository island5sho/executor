import { defineRule } from "@oxlint/plugins";
import path from "node:path";

import {
  isRuntimeOrPluginImplementationFile,
} from "../workspace-utils.mjs";

const ALLOWED_PATH_SEGMENTS = [
  `${path.sep}packages${path.sep}platform${path.sep}sdk${path.sep}src${path.sep}runtime${path.sep}scope${path.sep}runtime-context.ts`,
];

const readTypeArguments = (node) =>
  node?.typeParameters?.params ?? node?.typeArguments?.params ?? [];

const isIdentifierNamed = (node, name) =>
  node?.type === "Identifier" && node.name === name;

const isEffectTypeName = (node) =>
  node?.type === "TSQualifiedName"
  && isIdentifierNamed(node.left, "Effect")
  && isIdentifierNamed(node.right, "Effect");

const isNeverEffectType = (node) => {
  if (node?.type !== "TSTypeReference" || !isEffectTypeName(node.typeName)) {
    return false;
  }

  const typeArguments = readTypeArguments(node);
  return typeArguments.length >= 3 && typeArguments[2]?.type === "TSNeverKeyword";
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow casting Effect environments to never in runtime and plugin implementation files.",
      recommended: true,
    },
    messages: {
      noEffectNeverCast:
        "Do not cast an Effect environment to `never` in runtime or plugin implementation code. Provide the missing services or keep the environment generic so the compiler can track it.",
    },
  },
  create(context) {
    if (
      !isRuntimeOrPluginImplementationFile(context.filename)
      || ALLOWED_PATH_SEGMENTS.some((segment) => context.filename.includes(segment))
    ) {
      return {};
    }

    const reportIfNeverEffectCast = (node, typeAnnotation) => {
      if (!isNeverEffectType(typeAnnotation)) {
        return;
      }

      context.report({
        node: typeAnnotation,
        messageId: "noEffectNeverCast",
      });
    };

    return {
      TSAsExpression(node) {
        reportIfNeverEffectCast(node, node.typeAnnotation);
      },
      TSTypeAssertion(node) {
        reportIfNeverEffectCast(node, node.typeAnnotation);
      },
    };
  },
});
